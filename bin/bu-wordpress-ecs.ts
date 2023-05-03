#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BuWordpressEcsStack } from '../lib/bu-wordpress-ecs-stack';

const app = new cdk.App();
new BuWordpressEcsStack(app, 'BuWordpressEcsStack');
