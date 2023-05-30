#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as context from '../context/_default.json';
import { BuWordpressEcsStack as FargateStack } from '../lib/ecs-stacks/fargate-L3';
import { BuWordpressEcsStack as CssStack } from '../lib/ecs-stacks/ec2-L2';

const app = new cdk.App();

app.node.setContext('stack-parms', context);

switch(context.SCENARIO) {

  case 'fargate':

    new FargateStack(app, 'S3ProxyFargateStack', {
      stackName: 's3proxy-fargate-dev',
      description: 'Fargate ECS cluster for s3proxy signing service',
      env: {
        account: context.ACCOUNT,
        region: context.REGION
      }
    });
    break;

  case 'ec2':

    new CssStack(app, 'S3ProxyEcsStack', {
      stackName: 's3proxy-ecs-dev',
      description: "EC2 ECS cluster for s3proxy signing service",
      env: {
        account: context.ACCOUNT,
        region: context.REGION
      }
    });
    break;
}

    

