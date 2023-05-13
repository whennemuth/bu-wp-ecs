#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BuWordpressEcsStack } from '../lib/bu-wordpress-ecs-stack';
import { BuNetwork } from '../lib/bu-network';
import * as contextFile from '../context.json';

const app = new cdk.App();

new BuNetwork().getDetails().then(networkDetails => {

  const context = Object.assign(
    {},
    contextFile, 
    { VPC_ID: networkDetails.vpcId },
    { CAMPUS_SUBNET1: networkDetails.getCampusSubnetId(0)},
    { CAMPUS_SUBNET2: networkDetails.getCampusSubnetId(1)},
    { DOCKER_IMAGE_V4SIG: contextFile.DOCKER_IMAGE_V4SIG || 'public.ecr.aws/bostonuniversity/aws-sigv4-proxy:latest' }
  );

  app.node.setContext('env', context);

  new BuWordpressEcsStack(app, 'S3ProxyEcsStack', {
    stackName: 's3proxy-ecs-dev',
    env: {
      account: context.ACCOUNT,
      region: context.REGION
    }
  });
})


