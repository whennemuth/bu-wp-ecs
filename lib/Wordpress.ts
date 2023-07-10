import { AdaptableConstruct, FargateService } from './AdaptableFargateService';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PropagatedTagSource, FargateTaskDefinition, ContainerDefinitionOptions } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService as albfs } from 'aws-cdk-lib/aws-ecs-patterns';
import { WordpressAppContainerDefConfig } from './WordpressAppContainerDefConfig';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';

import * as route53 from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export abstract class WordpressEcsConstruct extends AdaptableConstruct implements FargateService {

  sidecarContainerDefProps: ContainerDefinitionOptions;
  
  constructor(scope: Construct, id: string) {    

    super(scope, id);

    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.id = id;
    this.prefix = this.context.PREFIXES.wordpress;
    this.healthcheck = '/healthcheck.htm';

    this.setResourceProperties();

    this.adaptResourceProperties();

    this.buildResources();

    this.adaptResources();
  }

  setResourceProperties(): void {

    this.containerDefProps = new WordpressAppContainerDefConfig().getProperties(this);

    this.sidecarContainerDefProps = new WordpressS3ProxyContainerDefConfig().setPrefix('s3proxy').getProperties(this);

    this.taskDefProps = { family: this.prefix, cpu: 512, memoryLimitMiB: 2048 };

    this.fargateServiceProps = {
      loadBalancerName: `${this.id}-alb`,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      propagateTags: PropagatedTagSource.TASK_DEFINITION,
      capacityProviderStrategies: [ { capacityProvider: 'FARGATE', base: 1, weight: 1 } ]
    };
  }

  buildResources(): void {

    this.setStackTags();

    const wordpressTaskDef = new FargateTaskDefinition(this, `${this.prefix}-taskdef`, this.taskDefProps);

    wordpressTaskDef.addContainer(`${this.prefix}`, this.containerDefProps);

    wordpressTaskDef.addContainer('s3proxy', this.sidecarContainerDefProps);

    this.fargateService = new albfs(
      this, `${this.prefix}-fargate-service`, 
      Object.assign(this.fargateServiceProps, { taskDefinition: wordpressTaskDef } )
    );

    // Get the ALB to log to a bucket
    this.fargateService.loadBalancer.logAccessLogs(new Bucket(this, `${this.id}-alb-access-logs`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    }));
  }
}


/**
 * "Clean sheet of paper" baseline that models aws recommended best practices.
 * Provides a "standard" deployment of this construct as one would conduct in an unconstrained aws account, accepting most defaults.
 */
export class StandardWordpressConstruct extends WordpressEcsConstruct {
  adaptResourceProperties(): void { /* Do nothing */ }
  adaptResources(): void { /* Do nothing */ }
};