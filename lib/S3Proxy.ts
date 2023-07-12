import { AdaptableConstruct, FargateService } from './AdaptableFargateService';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ApplicationLoadBalancedFargateService as albfs } from 'aws-cdk-lib/aws-ecs-patterns';
import { PropagatedTagSource, FargateTaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';

/**
 * If you want to run the s3proxy sigv4 signing service as it's own standalone load-balanced fargate service,
 * use this construct. However, the service provided here is ultimately intended to be provided in the form
 * of a "sidecar" container to main container of the wordpress taskdef.
 */
export abstract class WordpressS3ProxyEcsConstruct extends AdaptableConstruct implements FargateService {

  constructor(scope: Construct, id: string) {

    super(scope, id);
    
    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.id = id;
    this.prefix = this.context.PREFIXES.s3proxy;
    this.healthcheck = '/s3proxy-healthcheck';

    this.setResourceProperties();

    this.adaptResourceProperties();

    this.buildResources();

    this.adaptResources();
  }

  setResourceProperties(): void {

    this.containerDefProps = new WordpressS3ProxyContainerDefConfig().getProperties(this);
    
    this.taskDefProps = { family: this.prefix, cpu: 256, memoryLimitMiB: 512 };

    this.fargateServiceProps = {
      loadBalancerName: `${this.id}-alb`,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      propagateTags: PropagatedTagSource.TASK_DEFINITION,
      capacityProviderStrategies: [ { capacityProvider: 'FARGATE', base: 1, weight: 1 } ],
    }
  }

  /**
   * Create the wordpress fargate service and related resources for the stack.
   * @param id 
   */
  buildResources() {

    this.setStackTags();
    
    const taskdef = new FargateTaskDefinition(this, `${this.prefix}-taskdef`, this.taskDefProps);

    taskdef.addContainer(`${this.prefix}`, this.containerDefProps);

    this.fargateService = new albfs(
      this, `${this.prefix}-fargate-service`, 
      Object.assign(this.fargateServiceProps, { taskDefinition: taskdef } )
    );

    this.fargateService.targetGroup.configureHealthCheck({
      path: this.healthcheck
    });
    
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
export class StandardS3ProxyConstruct extends WordpressS3ProxyEcsConstruct { 
  adaptResourceProperties(): void { /* Do nothing */ } 
  adaptResources(): void { /* Do nothing */ }
};