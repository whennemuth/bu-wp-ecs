#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { IContext, SCENARIO as scenarios } from '../contexts/IContext';
import { StandardS3ProxyConstruct } from '../lib/S3Proxy';
import { StandardWordpressConstruct, WordpressEcsConstruct } from '../lib/Wordpress';
import { BuWordpressEcsConstruct as BuWordpressConstruct } from '../lib/adaptations/WordpressBU';
import { BuWordpressS3ProxyEcsConstruct as BuS3ProxyConstruct } from '../lib/adaptations/S3ProxyBU';
import { BuWordpressRdsConstruct as RdsConstruct } from '../lib/Rds';
import { BuS3ProxyEc2Stack as S3ProxyEc2Stack } from '../lib/temp/ec2';
import { IVpc, IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';
import { HostedZoneWordpressEcsConstruct } from '../lib/adaptations/WordpressWithHostedZone';
import { SelfSignedWordpressEcsConstruct } from '../lib/adaptations/WordpressSelfSigned';
import { checkIamServerCertificate } from '../lib/Certificate';
import { CloudfrontWordpressEcsConstruct } from '../lib/adaptations/WordpressBehindCloudfront';

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
    var rds = new RdsConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.rds}`, { vpc });

    getStandardCompositeInstance(
      stack, 
      `${context.STACK_ID}-${context.PREFIXES.wordpress}`, { 
        vpc,
        rdsHostName: rds.endpointAddress 
      }
    ).then(ecs => {
      rds.addSecurityGroupIngressTo(ecs.securityGroup.securityGroupId);
    });    
    break;
  case scenarios.COMPOSITE_BU:
    var stack = new Stack(app, 'CompositeStack', stackProps);
    var iVpc: IVpc = Vpc.fromLookup(stack, 'BuVpc', { vpcId: ctx.VPC_ID })
    var rds = new RdsConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.rds}`, { vpc: iVpc });
    var buEcs = new BuWordpressConstruct(
      stack, 
      `${context.STACK_ID}-${context.PREFIXES.wordpress}`, { 
        vpc: iVpc,
        rdsHostName: rds.endpointAddress
      }
    );
    rds.addSecurityGroupIngressTo(buEcs.securityGroup.securityGroupId);
    break;
  case scenarios.WORDPRESS:
    new StandardWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), `${context.STACK_ID}-${context.PREFIXES.wordpress}`);
    break;  
  case scenarios.WORDPRESS_BU:
    new BuWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), `${context.STACK_ID}-${context.PREFIXES.wordpress}`);
    break;
  case scenarios.RDS:
    var stack = new Stack(app, 'RdsStack', stackProps);
    var vpc: Vpc = new Vpc(stack, `${context.STACK_ID}-vpc`, { 
      ipAddresses: IpAddresses.cidr('10.0.0.0/21'),
      availabilityZones: [ `${context.REGION}a`, `${context.REGION}b`]
    }); 
    new RdsConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.rds}`, { vpc });
    break;

  /**
   * NOTE: The s3 proxy is intended for bundling with the wordpress taskdef. 
   * A standalone implementation is provided here for ease of troublshooting issues with the proxying service, 
   * which may be difficult to do when it is in the form of a sidecar container within the taskdef of another service.
   */
  case scenarios.S3PROXY: 
    new StandardS3ProxyConstruct(new Stack(app, 'S3ProxyStack', stackProps), `${context.STACK_ID}-${context.PREFIXES.s3proxy}`);
    break;
  case scenarios.S3PROXY_BU:
    new BuS3ProxyConstruct(new Stack(app, 'S3ProxyStack', stackProps), `${context.STACK_ID}-${context.PREFIXES.s3proxy}`);
    break;

  /**
   * NOTE: This is a legacy service deployment of s3 proxying for ecs that is NOT based on fargate, but ec2.
   * It is being kept around for now for reference as it contains solutions to some potentially applicable problems.
   * Eventually destined for the scrap heap. 
   */
  case scenarios.S3PROXY_EC2:
    new S3ProxyEc2Stack(app, 'S3ProxyEcsStack', {
      stackName: 's3proxy-ecs-dev',
      description: "EC2 ECS cluster for s3proxy signing service",
      env: {
        account: context.ACCOUNT,
        region: context.REGION
      }
    });
    break;
}

/**
* Static factory for standard wordpress constructs of the composite scenario.
* @param stack 
* @param id 
* @param props 
* @returns 
*/
async function getStandardCompositeInstance(stack: Stack, id: string, props?: any): Promise<WordpressEcsConstruct> {
  const context:IContext = stack.node.getContext('stack-parms');
  if(context?.DNS?.certificateARN && context?.DNS?.hostedZone) {
    return new HostedZoneWordpressEcsConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.wordpress}`, props);
  }
  else if(context.BEHIND_CLOUDFRONT) {
    return new CloudfrontWordpressEcsConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.wordpress}`, props);
  }
  else if( ! context?.DNS?.certificateARN) {
    return checkIamServerCertificate().then(arn => {
      Object.assign(props, { iamServerCertArn: arn })
      return new SelfSignedWordpressEcsConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.wordpress}`, props);
    });    
  }
  else {
    console.log("WARNING: This fargate service will not be publicly addressable. " + 
      "Some modification after stack creation will be required.");
    return new StandardWordpressConstruct(stack, `${context.STACK_ID}-${context.PREFIXES.wordpress}`, props);
  }
}

   

