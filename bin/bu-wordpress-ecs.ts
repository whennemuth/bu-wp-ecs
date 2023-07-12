#!/usr/bin/env node
import { App, Stack } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { StandardS3ProxyConstruct } from '../lib/S3Proxy';
import { StandardWordpressConstruct } from '../lib/Wordpress';
import { BuWordpressEcsConstruct as BuWordpressConstruct } from '../lib/WordpressBU';
import { BuWordpressS3ProxyEcsConstruct as BuS3ProxyConstruct } from '../lib/S3ProxyBU';
import { BuWordpressRdsConstruct as RdsConstruct } from '../lib/Rds';
import { BuS3ProxyEc2Stack as S3ProxyEc2Stack } from '../lib/temp/ec2';

const app = new App();
app.node.setContext('stack-parms', context);

const stackProps = {
  stackName: 's3proxy-fargate-dev',
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

switch(context.SCENARIO) {

  /**
   * Standard scenarios for deployment.
   */
  case 'composite':
    var stack = new Stack(app, 'CompositeStack', stackProps);
    new RdsConstruct(stack, context.PREFIXES['rds']);
    new StandardWordpressConstruct(stack, context.PREFIXES['wordpress']);
    break;
  case 'composite-bu':
    var stack = new Stack(app, 'CompositeStack', stackProps);
    new RdsConstruct(stack, context.PREFIXES['rds']);
    new BuWordpressConstruct(stack, context.PREFIXES['wordpress']);
  case 'wordpress':
    new StandardWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), context.STACK_ID);
    break;  
  case 'wordpress-bu':
    new BuWordpressConstruct(new Stack(app, 'WordpressStack', stackProps), context.STACK_ID);
    break;
  case 'rds':
    new RdsConstruct(new Stack(app, 'RdsStack', stackProps), context.STACK_ID);
    break;

  /**
   * NOTE: The s3 proxy is intended for bundling with the wordpress taskdef. 
   * A standalone implementation is provided here for ease of troublshooting issues with the proxying service, 
   * which may be difficult to do when it is in the form of a sidecar container within the taskdef of another service.
   */
  case 's3proxy': 
    new StandardS3ProxyConstruct(new Stack(app, 'S3ProxyStack', stackProps), context.STACK_ID);
    break;
  case 's3proxy-bu':
    new BuS3ProxyConstruct(new Stack(app, 'S3ProxyStack', stackProps), context.STACK_ID);
    break;

  /**
   * NOTE: This is a legacy service deployment of s3 proxying for ecs that is NOT based on fargate, but ec2.
   * It is being kept around for now for reference as it contains solutions to some potentially applicable problems.
   * Eventually destined for the scrap heap. 
   */
  case 's3proxy-ec2':
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

    

