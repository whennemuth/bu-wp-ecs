#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';
import { IContext } from '../contexts/IContext';
import * as context from '../contexts/context.json';
import { checkIamServerCertificate } from '../lib/Certificate';
import { BuWordpressRdsConstruct as RdsConstruct } from '../lib/Rds';
import { StandardWordpressConstruct, WordpressEcsConstruct } from '../lib/Wordpress';
import { CloudfrontWordpressEcsConstruct, lookupCloudfrontHeaderChallenge, lookupCloudfrontPrefixListId } from '../lib/adaptations/WordpressBehindCloudfront';
import { SelfSignedWordpressEcsConstruct } from '../lib/adaptations/WordpressSelfSigned';
import { HostedZoneWordpressEcsConstruct } from '../lib/adaptations/WordpressWithHostedZone';

const render = async ():Promise<void> => {
  const app = new App();
  app.node.setContext('stack-parms', context);

  // Deconstruct the context
  const { 
    ACCOUNT:account, REGION:region, STACK_ID, DNS,
    TAGS: { Service, Function, Landscape }, 
    PREFIXES: { wordpress:pfxWordpress, rds:pfxRds }
  } = context as IContext;

  // Define the stack properties
  const stackProps: StackProps = {
    stackName: `${STACK_ID}-${Landscape}`,
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
  const { WORDPRESS: { secret: { arn:secretArn }}} = context;
  const { hostedZone, certificateARN, cloudfront } = DNS ?? {};

  // Define the RDS construct
  const rds = new RdsConstruct(stack, rdsId, { vpc });
  const { endpointAddress:rdsHostName } = rds;

  // Define the ECS construct
  let ecs:WordpressEcsConstruct;
  if( ! certificateARN) {
    const iamServerCertArn = await checkIamServerCertificate();
    ecs = new SelfSignedWordpressEcsConstruct(stack, wpId, { vpc, rdsHostName, iamServerCertArn });
  }
  else if(cloudfront) {
    const { challengeSecretFld } = cloudfront;
    const prefixId = await lookupCloudfrontPrefixListId(region);
    const challenge = await lookupCloudfrontHeaderChallenge(secretArn, challengeSecretFld);
    ecs = new CloudfrontWordpressEcsConstruct(stack, wpId, { 
      vpc, rdsHostName, 'cloudfront-prefix-id':prefixId, 'cloudfront-challenge':challenge,
    });
  }
  else if(hostedZone) {
    ecs = new HostedZoneWordpressEcsConstruct(stack, wpId, { vpc, rdsHostName });
  }
  else {
    console.log("WARNING: This fargate service will not be publicly addressable. " + 
      "Some modification after stack creation will be required.");
    ecs = new StandardWordpressConstruct(stack, wpId, { vpc, rdsHostName });
  }

  // Grant wordpress access to the database
  rds.addSecurityGroupIngressTo(ecs.securityGroup.securityGroupId);
}

render()
.then(() => {
  console.log('Render complete!')
})
.catch(e => {
  JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
});

   

