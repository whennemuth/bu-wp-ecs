import { AdaptableConstruct, FargateService } from './AdaptableFargateService';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PropagatedTagSource, FargateTaskDefinition, ContainerDefinitionOptions } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService as albfs } from 'aws-cdk-lib/aws-ecs-patterns';
import { WordpressAppContainerDefConfig } from './WordpressAppContainerDefConfig';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { SCENARIO as scenarios } from '../contexts/IContext';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

/** 
 * RESUME NEXT: 
 *   1) Test that enableExecuteCommand configuration works by using ecs execute-command in a cloud shell against the wordpress container.
 *      https://dev.to/aws-builders/how-to-run-a-shell-on-ecs-fargate-containers-eo1
 *   2) Document last step in readme file.
 *   3) Get local mysql workbench connection to aurora working
 *   4) Confirm wordpress container is talking to aurora.
 *   5) Figure out how to get http (not https) health check endpoint to be ok with apache.
 *   6) Rebuild and switch to the "bu-wordpress-build" image and configure a wordpress site that gets an 
 *      asset from the bucket to confirm the s3proxy sidecar is working. May need to append ":8080" to the localhost proxy
*/

export abstract class WordpressEcsConstruct extends AdaptableConstruct implements FargateService {

  private _sidecarContainerDefProps: ContainerDefinitionOptions;
  private _securityGroup: SecurityGroup;
  
  constructor(scope: Construct, id: string, props?: any) {    

    super(scope, id);

    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.id = id;
    this.props = props;
    this.healthcheck = '/healthcheck.htm';

    this.setResourceProperties();

    this.adaptResourceProperties();

    this.buildResources();

    this.adaptResources();
  }

  /**
   * Determine if the context indicates the s3proxy signing service should run as a sidecar container to the wordpress container.
   * @returns 
   */
  includeSidecar(): boolean {
    const composite = 
      this.context.SCENARIO == scenarios.COMPOSITE || 
      this.context.SCENARIO == scenarios.COMPOSITE_BU;
    const s3ProxyHost = this.context.WORDPRESS.env.s3ProxyHost ?? 'localhost';
    return composite && s3ProxyHost == 'localhost';
  }

  setResourceProperties(): void {

    this.containerDefProps = new WordpressAppContainerDefConfig().getProperties(this);

    if(this.includeSidecar()) {
      this._sidecarContainerDefProps = new WordpressS3ProxyContainerDefConfig().setPrefix('s3proxy').getProperties(this);
    }
    
    this.taskDefProps = { family: this.id, cpu: 1024, memoryLimitMiB: 2048, };

    this._securityGroup = new SecurityGroup(this, `${this.id}-fargate-sg`, {
      vpc: this.getVpc(), 
      securityGroupName: `wp-fargate-${this.context.TAGS.Landscape}-sg`,
      description: 'Allows for ingress to the wordpress rds db from ecs tasks and selected vpn subnets.',
      allowAllOutbound: true,
    });  
    
    this.fargateServiceProps = {
      serviceName: `${this.id}-service`,
      enableExecuteCommand: true,
      loadBalancerName: `${this.id}-fargate-alb`,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      propagateTags: PropagatedTagSource.TASK_DEFINITION,
      capacityProviderStrategies: [ { capacityProvider: 'FARGATE', base: 1, weight: 1 } ],
      securityGroups: [ this._securityGroup ],
      vpc: this.getVpc(),
      assignPublicIp: false,
      healthCheckGracePeriod: Duration.seconds(15),
      publicLoadBalancer: false,
    };
  }

  buildResources(): void {

    this.setStackTags();

    const wordpressTaskDef = new FargateTaskDefinition(this, `${this.id}-taskdef`, this.taskDefProps);

    wordpressTaskDef.addContainer(`${this.id}-taskdef-wp`, this.containerDefProps);

    if(this.includeSidecar()) {
      wordpressTaskDef.addContainer(`${this.id}-taskdef-s3proxy`, this._sidecarContainerDefProps);
    }

    this.fargateService = new albfs(
      this, `${this.id}-fargate-service`, 
      Object.assign(this.fargateServiceProps, { taskDefinition: wordpressTaskDef } )
    );

    // TODO: fix healthcheck and change healthyHttpCodes to something like "200-299"
    this.fargateService.targetGroup.configureHealthCheck({
      path: this.healthcheck,
      healthyHttpCodes: '200-499'
    });
    
    // Get the ALB to log to a bucket
    this.fargateService.loadBalancer.logAccessLogs(new Bucket(this, `${this.id}-alb-access-logs`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    }));

    // Grant the task definition the ability to:
    //   1) Pull docker images from the account ecr.
    //   2) Run shell access to containers
    this.fargateService.service.taskDefinition.addToExecutionRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      resources: [ '*' ],
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
        'ecr:GetAuthorizationToken',
        // 'ssmmessages:CreateControlChannel',
        // 'ssmmessages:CreateDataChannel',
        // 'ssmmessages:OpenControlChannel',
        // 'ssmmessages:OpenDataChannel'
      ]
    }));
  }

  public get securityGroup(): SecurityGroup {
    return this._securityGroup;
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
