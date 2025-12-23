#!/usr/bin/env node
import { App, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';
import { IContext, SecretFieldNames } from '../contexts/IContext';
import * as context from '../contexts/context.json';
import { checkIamServerCertificate } from '../lib/Certificate';
import { BuWordpressRdsConstruct as RdsConstruct } from '../lib/Rds';
import { StandardWordpressConstruct, WordpressEcsConstruct } from '../lib/Wordpress';
import { CloudfrontWordpressEcsConstruct, lookupCloudfrontHeaderChallenge, lookupCloudfrontPrefixListId } from '../lib/adaptations/WordpressBehindCloudfront';
import { SelfSignedWordpressEcsConstruct } from '../lib/adaptations/WordpressSelfSigned';
import { HostedZoneForALBWordpressEcsConstruct, HostedZoneForCloudfrontWordpressEcsConstruct } from '../lib/adaptations/WordpressWithHostedZone';
import { findARecord } from './route-53';
import { CustomResourceConfig } from 'aws-cdk-lib/custom-resources';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { SecretsManagerSecret } from '../lib/Secret';
import { logHeader } from '../lib/Utils';

export const getStackName = ():string => {
  return `${context.STACK_ID}-${context.TAGS.Landscape}`;
}

(async () => {
  // Instatiate the app
  const app = new App();

  // Configure custom resource defaults
  CustomResourceConfig.of(app).addRemovalPolicy(RemovalPolicy.DESTROY);
  CustomResourceConfig.of(app).addLogRetentionLifetime(RetentionDays.ONE_WEEK);
  
  app.node.setContext('stack-parms', context);

  // Deconstruct the context
  const { 
    ACCOUNT:account, REGION:region, STACK_ID, DNS,
    TAGS: { Service, Function, Landscape }, 
    PREFIXES: { wordpress:pfxWordpress, rds:pfxRds },
    WORDPRESS: { secret: { spSecretArn, wpSecretArn }}
  } = context as IContext;

  /**
   * Ensure the secret parameter is defined and refers to an existing secret
   * @param parm 
   */
  const validateSecret = async (parm: { fldName:string, secretArn: string }): Promise<void> => {
    const { fldName, secretArn } = parm;

    let msg = fldName.includes('wp') ?
      `\nYou can create and upload it to secrets manager by populating the ./.env file as ` +
      `\ndirected in the README and running "npm run create-secrets".` :
      `\nHelper scripts to create and upload this secret to secrets manager are available ` +
      `\nin the bu-lambda-shibboleth repository as directed in its README.`;

    // Make sure the secretArn is defined and refers to an existing secret
    if( secretArn ) {
      const exists = await new SecretsManagerSecret({ 
        secretName: secretArn, fldNames: {} as SecretFieldNames, region 
      }).exists();

      // Abort if the specified secret does not exist
      if( ! exists ) {
        logHeader('VALIDATION ERROR!!!');
        console.error(`The secret ${secretArn} does not exist as specified in ${fldName}. ` + msg);
        process.exit(1);
      }
    }
    else {
      logHeader('VALIDATION ERROR!!!');
      console.error(`${fldName} must be defined in the context file. ` + msg);
      process.exit(1);
    }
  }

  // Validate the wordpress secret
  await validateSecret({ fldName:'WORDPRESS.secret.wpSecretArn', secretArn: wpSecretArn });
  
  // Validate the secret for shib-sp details 
  await validateSecret({ fldName:'WORDPRESS.secret.spSecretArn', secretArn: spSecretArn });

  // Define the stack properties
  const stackProps: StackProps = {
    stackName: getStackName(),
    description: 'Fargate ECS cluster for wordpress, s3proxy, and rds',
    env: { account, region },
    tags: { Service, Function, Landscape }
  }

  // Define properties
  const wpId = `${STACK_ID}-${pfxWordpress}`;
  const rdsId = `${STACK_ID}-${pfxRds}`;
  const stack = new Stack(app, 'StandardStack', stackProps);
  const ipAddresses = IpAddresses.cidr('10.0.0.0/21');
  const availabilityZones = [ `${region}a`, `${region}b`];
  const vpc: Vpc = new Vpc(stack, `${STACK_ID}-vpc`, { ipAddresses, availabilityZones }); 
  const { hostedZone, subdomain, certificateARN, cloudfront, cloudfront: { 
    challengeHeaderName='', distributionDomainName='' 
  } = {} } = DNS ?? {};


  // Define the RDS construct
  const rds = new RdsConstruct(stack, rdsId, { vpc });
  const { endpointAddress:rdsHostName } = rds;

  // Define a helper function to lookup cloudfront parameters indicating custom headers for shib-sp integration
  const lookupCloudfrontParameters = async () => {
    const prefixId = await lookupCloudfrontPrefixListId(region);
    const challenge = await lookupCloudfrontHeaderChallenge(spSecretArn, challengeHeaderName);
    return { 'cloudfront-prefix-id':prefixId, 'cloudfront-challenge':challenge };
  };

  let ecs:WordpressEcsConstruct;

  if( ! certificateARN) {
    // Define an ECS construct that routes https via a self-signed iam certificate.
    const iamServerCertArn = await checkIamServerCertificate();
    ecs = new SelfSignedWordpressEcsConstruct(stack, wpId, { vpc, rdsHostName, iamServerCertArn });
  }
  else if(distributionDomainName && hostedZone) {
    // Define an ECS construct that is routed to through a pre-existing cloudfront distribution via route53.
    const cfParms = await lookupCloudfrontParameters();

    // Find out if an A record for the subdomain already exists AND was not created by this stack.
    let ignoreRoute53:boolean = false;
    if( subdomain && hostedZone ) {
      const record = await findARecord(hostedZone, subdomain, region);
      if(record.recordSet && ! record.createdByThisStack) {
        ignoreRoute53 = true;
      }
    }

    ecs = new HostedZoneForCloudfrontWordpressEcsConstruct({
      baseline: stack,
      id: wpId,
      props: { vpc, rdsHostName, ignoreRoute53, ...cfParms },
      distributionDomainName
    });
  }
  else if(cloudfront && ! hostedZone) {
    // Define an ECS construct that accepts traffic only from a pre-existing cloudfront distribution 
    // on its default domain that is configured to route to the ALB created by the fargate construct.
    const cfParms = await lookupCloudfrontParameters();
    ecs = new CloudfrontWordpressEcsConstruct(stack, wpId, { 
      vpc, rdsHostName, ...cfParms
    });
  }
  else if(hostedZone) {
    // Define an ECS construct that routes through the auto-created ALB of the fargate construct via route53.
    ecs = new HostedZoneForALBWordpressEcsConstruct(stack, wpId, { vpc, rdsHostName });
  }
  else {
    // Define a standard ECS construct that is not publicly addressable.
    console.log("WARNING: This fargate service will not be publicly addressable. " + 
      "Some modification after stack creation will be required.");
    ecs = new StandardWordpressConstruct(stack, wpId, { vpc, rdsHostName });
  }

  // Grant wordpress access to the database
  rds.addSecurityGroupIngressTo(ecs.securityGroup.securityGroupId);
})();

   

