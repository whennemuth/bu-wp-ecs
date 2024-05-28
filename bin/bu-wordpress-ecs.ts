#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { IContext, SCENARIO as scenarios } from '../contexts/IContext';
import { StandardS3ProxyConstruct } from '../lib/S3Proxy';
import { StandardWordpressConstruct, WordpressEcsConstruct } from '../lib/Wordpress';
import { BuWordpressEcsConstruct as BuWordpressConstruct } from '../lib/adaptations/WordpressBU';
import { BuWordpressS3ProxyEcsConstruct as BuS3ProxyConstruct } from '../lib/adaptations/S3ProxyBU';
import { BuWordpressRdsConstruct as RdsConstruct } from '../lib/Rds';
import { IVpc, IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';
import { HostedZoneWordpressEcsConstruct } from '../lib/adaptations/WordpressWithHostedZone';
import { SelfSignedWordpressEcsConstruct } from '../lib/adaptations/WordpressSelfSigned';
import { checkIamServerCertificate } from '../lib/Certificate';
import { CloudfrontWordpressEcsConstruct, lookupCloudfrontHeaderChallenge, lookupCloudfrontPrefixListId } from '../lib/adaptations/WordpressBehindCloudfront';

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

  case scenarios.COMPOSITE_BU:
    var stack = new Stack(app, 'CompositeStack', stackProps);
    var iVpc: IVpc = Vpc.fromLookup(stack, 'BuVpc', { vpcId: ctx.VPC_ID })
    var rds = new RdsConstruct(stack, rdsId, { vpc: iVpc });
    var buEcs = new BuWordpressConstruct(
      stack, wpId, { vpc: iVpc, rdsHostName:rds.endpointAddress }
    );
    rds.addSecurityGroupIngressTo(buEcs.securityGroup.securityGroupId);
    break;

  case scenarios.WORDPRESS:
    new StandardWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), wpId);
    break; 

  case scenarios.WORDPRESS_BU:
    new BuWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), wpId);
    break;

  case scenarios.RDS:
    var stack = new Stack(app, 'RdsStack', stackProps);
    var vpc: Vpc = new Vpc(stack, `${context.STACK_ID}-vpc`, { 
      ipAddresses: IpAddresses.cidr('10.0.0.0/21'),
      availabilityZones: [ `${context.REGION}a`, `${context.REGION}b`]
    }); 
    new RdsConstruct(stack, rdsId, { vpc });
    break;

  /**
   * NOTE: The s3 proxy is intended for bundling with the wordpress taskdef. 
   * A standalone implementation is provided here for ease of troublshooting issues with the proxying service, 
   * which may be difficult to do when it is in the form of a sidecar container within the taskdef of another service.
   */
  case scenarios.S3PROXY: 
    new StandardS3ProxyConstruct(new Stack(app, 'S3ProxyStack', stackProps), s3ProxyId);
    break;

  case scenarios.S3PROXY_BU:
    new BuS3ProxyConstruct(new Stack(app, 'S3ProxyStack', stackProps), s3ProxyId);
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

   

