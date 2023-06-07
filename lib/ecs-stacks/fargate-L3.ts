import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2  from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecspat from 'aws-cdk-lib/aws-ecs-patterns';
import * as secretsmgr from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';

const prefix: string = 's3proxy';
const sigv4_prefix: string = 's3proxy';
const sigv4_host_port = 8080;
const sigv4_container_port = sigv4_host_port;
const olap_service: string = 's3-object-lambda';

export class BuWordpressEcsStack extends Stack {

  private context: any;
  private fargateService1: ecspat.ApplicationLoadBalancedFargateService;
  private cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props?: StackProps) {

    super(scope, id, props);

    const stack: BuWordpressEcsStack = this;

    stack.context = scope.node.getContext('stack-parms');

    stack.setStackTags(stack);

    stack.setFargateService(stack);
  }

  private useSSL(stack: BuWordpressEcsStack): boolean {
    if( ! stack.context.HOSTED_ZONE ) return false;
    if( ! stack.context.RECORD_NAME ) return false;
    if( ! stack.context.CERTIFICATE_ARN ) return false;
    return true;
  }

  private setStackTags(stack: BuWordpressEcsStack) {
    // Set the tags for the stack
    stack.tags.setTag('Service', stack.context.TAG_SERVICE);
    stack.tags.setTag('Function', stack.context.TAG_FUNCTION);
    stack.tags.setTag('Landscape', stack.context.TAG_LANDSCAPE);  
  }

  private setFargateService(stack: BuWordpressEcsStack) {

    stack.cluster = new ecs.Cluster(stack, `${prefix}-cluster`, { 
      vpc: new ec2.Vpc(this, 'Vpc', { maxAzs: 2 }),
      containerInsights: true,
      clusterName: `${prefix}-cluster`
    });

    // Create the service and load balancer
    stack.fargateService1 = new ecspat.ApplicationLoadBalancedFargateService(stack, `${prefix}-fargate-service`, {
      cluster: stack.cluster,
      loadBalancerName: `${prefix}-alb`,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          base: 1,
          weight: 1
        }
      ],
    });

    // Get the ALB to log to a bucket
    stack.fargateService1.loadBalancer.logAccessLogs(new s3.Bucket(stack, `${prefix}-alb-access-logs`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    }));
  }
}