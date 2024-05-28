#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';
import { IContext, SCENARIO as scenarios } from '../contexts/IContext';
import * as context from '../contexts/context.json';
import { checkIamServerCertificate } from '../lib/Certificate';
import { BuWordpressRdsConstruct as RdsConstruct } from '../lib/Rds';
import { StandardS3ProxyConstruct } from '../lib/S3Proxy';
import { StandardWordpressConstruct, WordpressEcsConstruct } from '../lib/Wordpress';
import { CloudfrontWordpressEcsConstruct, lookupCloudfrontHeaderChallenge, lookupCloudfrontPrefixListId } from '../lib/adaptations/WordpressBehindCloudfront';
import { SelfSignedWordpressEcsConstruct } from '../lib/adaptations/WordpressSelfSigned';
import { HostedZoneWordpressEcsConstruct } from '../lib/adaptations/WordpressWithHostedZone';

const app = new App();
app.node.setContext('stack-parms', context);
const ctx = app.node.getContext('stack-parms');

const stackProps: StackProps = {
  stackName: `${context.STACK_NAME}-${context.TAGS.Landscape}`,
  description: 'Fargate ECS cluster for wordpress, s3proxy, and rds',
  env: {
    account: context.ACCOUNT,
    region: context.REGION
  },
  tags: {
    Service: context.TAGS.Service,
    Function: context.TAGS.Function,
    Landscape: context.TAGS.Landscape
  }
}

const wpId = `${context.STACK_ID}-${context.PREFIXES.wordpress}`;
const rdsId = `${context.STACK_ID}-${context.PREFIXES.rds}`;
const s3ProxyId = `${context.STACK_ID}-${context.PREFIXES.s3proxy}`;

switch(context.SCENARIO.toLowerCase()) {

  /**
   * Scenario choices for deployment.
   */
  case scenarios.COMPOSITE:
    var stack = new Stack(app, 'CompositeStack', stackProps);
    var vpc: Vpc = new Vpc(stack, `${context.STACK_ID}-vpc`, { 
      ipAddresses: IpAddresses.cidr('10.0.0.0/21'),
      availabilityZones: [ `${context.REGION}a`, `${context.REGION}b`]
    }); 
    var rds = new RdsConstruct(stack, rdsId, { vpc });
    getStandardCompositeInstance(
      stack, { vpc, rdsHostName:rds.endpointAddress }
    ).then(ecs => {
      rds.addSecurityGroupIngressTo(ecs.securityGroup.securityGroupId);
    });    
    break;

  case scenarios.WORDPRESS:
    new StandardWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), wpId);
    break; 

  case scenarios.RDS:
    var stack = new Stack(app, 'RdsStack', stackProps);
    var vpc: Vpc = new Vpc(stack, `${context.STACK_ID}-vpc`, { 
      ipAddresses: IpAddresses.cidr('10.0.0.0/21'),
      availabilityZones: [ `${context.REGION}a`, `${context.REGION}b`]
    }); 
    new RdsConstruct(stack, rdsId, { vpc });
    break;
}

/**
* Static factory for standard wordpress constructs of the composite scenario.
* @param stack 
* @param id 
* @param props 
* @returns 
*/
async function getStandardCompositeInstance(stack: Stack, props?: any): Promise<WordpressEcsConstruct> {
  const context:IContext = stack.node.getContext('stack-parms');
  const { hostedZone, certificateARN, cloudfront } = context?.DNS ?? {};
  const { challengeSecretFld } = cloudfront ?? {};
  const { WORDPRESS: { secret: { arn:secretArn }}} = context;

  if( ! certificateARN) {
    return checkIamServerCertificate().then(arn => {
      Object.assign(props, { iamServerCertArn: arn })
      return new SelfSignedWordpressEcsConstruct(stack, wpId, props);
    });    
  }

  if(cloudfront && challengeSecretFld) {
    props['cloudfront-prefix-id'] = await lookupCloudfrontPrefixListId(context.REGION);
    props['cloudfront-challenge'] = await lookupCloudfrontHeaderChallenge(secretArn, challengeSecretFld);
    return new CloudfrontWordpressEcsConstruct(stack, wpId, props);
  }

  if(hostedZone) {
    return new HostedZoneWordpressEcsConstruct(stack, wpId, props);
  }

  console.log("WARNING: This fargate service will not be publicly addressable. " + 
    "Some modification after stack creation will be required.");
  return new StandardWordpressConstruct(stack, wpId, props);
}

   

