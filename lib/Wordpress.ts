import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Cluster, ContainerDefinitionOptions, FargateTaskDefinition, PropagatedTagSource } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService as albfs, ApplicationLoadBalancedFargateServiceProps as albfsp } from 'aws-cdk-lib/aws-ecs-patterns';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AdaptableConstruct, FargateService } from './AdaptableFargateService';
import { ParameterTester } from './Utils';
import { WordpressAppContainerDefConfig } from './WordpressAppContainerDefConfig';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';

/**
 * Baseline class for the wordpresss application load balanced fargate service.
 * Subclasses will "adapt" this baseline in order to customize it. 
 */
export abstract class WordpressEcsConstruct extends AdaptableConstruct implements FargateService {

  private sidecarContainerDefProps: ContainerDefinitionOptions;
  private _securityGroup: SecurityGroup;
  
  constructor(scope: Construct, id: string, props?: any) {    

    super(scope, id);

    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.id = id;
    this.props = props;
    this.healthcheck = '/healthcheck.htm';
    this.vpc = props.vpc;

    this.setResourceProperties();

    this.adaptResourceProperties();

    this.buildResources();

    this.adaptResources();
  }

  setResourceProperties(): void {

    const { id, vpc, context: { TAGS: { Landscape }, WORDPRESS } } = this;

    this.containerDefProps = new WordpressAppContainerDefConfig().getProperties(this);

    if(WORDPRESS.env?.s3ProxyHost == 'localhost') {
      this.sidecarContainerDefProps = new WordpressS3ProxyContainerDefConfig().setPrefix('s3proxy').getProperties(this);
    }
    
    this.taskDefProps = { family: id, cpu: 1024, memoryLimitMiB: 2048, };

    this._securityGroup = new SecurityGroup(this, `${id}-fargate-sg`, {
      vpc, 
      securityGroupName: `wp-fargate-${Landscape}-sg`,
      description: 'Allows for ingress to the wordpress rds db from ecs tasks and selected vpn subnets.',
      allowAllOutbound: true,
    });  
    
    this.fargateServiceProps = {
      serviceName: `${id}-service-${Landscape}`,
      cluster: new Cluster(this, `${id}-cluster`, {
        clusterName: `${id}-cluster-${Landscape}`,
        containerInsights: true,
        vpc
      }),
      enableExecuteCommand: true,
      loadBalancerName: `${id}-fargate-alb`,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      propagateTags: PropagatedTagSource.TASK_DEFINITION,
      capacityProviderStrategies: [ { capacityProvider: 'FARGATE', base: 1, weight: 1 } ],
      securityGroups: [ this._securityGroup ],
      assignPublicIp: false,
      healthCheckGracePeriod: Duration.seconds(15),
      publicLoadBalancer: false,
    } as albfsp;
  }

  buildResources(): void {

    const { id, fargateServiceProps, containerDefProps, context: { WORDPRESS },
       sidecarContainerDefProps: _sidecarContainerDefProps, taskDefProps, healthcheck } = this;

    this.setStackTags();

    const wordpressTaskDef = new FargateTaskDefinition(this, `${id}-taskdef`, taskDefProps);

    wordpressTaskDef.addContainer(`${id}-taskdef-wp`, containerDefProps);

    if(WORDPRESS.env?.s3ProxyHost == 'localhost') {
      wordpressTaskDef.addContainer(`${id}-taskdef-s3proxy`, _sidecarContainerDefProps);
    }

    this.fargateService = new albfs(
      this, `${id}-fargate-service`, 
      Object.assign(fargateServiceProps, { taskDefinition: wordpressTaskDef } )
    );

    const { fargateService: { loadBalancer, targetGroup, service: { taskDefinition } } } = this;

    targetGroup.configureHealthCheck({
      path: healthcheck,
      healthyThresholdCount: 3,
      unhealthyThresholdCount: 10, // default 2
      interval: Duration.seconds(15), // default 30 seconds
      healthyHttpCodes: '200-299',
    });
    
    // Get the ALB to log to a bucket
    loadBalancer.logAccessLogs(new Bucket(this, `${id}-alb-access-logs`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    }));

    // Grant the task definition the ability to:
    //   1) Pull docker images from the account ecr.
    //   2) Run shell access to containers
    taskDefinition.addToExecutionRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      resources: [ '*' ],
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:GetDownloadUrlForLayer',
        'ecr:GetAuthorizationToken',
      ]
    }));

    const { noneBlank } = ParameterTester;
    const { DNS } = this.context;
    const { hostedZone, subdomain, certificateARN } = DNS || {};

    if(noneBlank(hostedZone, subdomain, certificateARN)) {
      // Ensure the HTTP_HOST wordpress container environment variable is the dns name of the route53 and cloudfront custom domain.
      wordpressTaskDef.findContainer('wordpress')?.addEnvironment('HTTP_HOST', subdomain!);
      wordpressTaskDef.findContainer('wordpress')?.addEnvironment('SERVER_NAME', subdomain!);
      new CfnOutput(this.scope, 'CloudFrontDistributionURL', {
        value: `https://${subdomain}`,
        description: 'CloudFront Distribution URL',
      });
    }
    else {
      // Ensure the HTTP_HOST wordpress container environment variable is the dns name of the alb.
      wordpressTaskDef.findContainer('wordpress')?.addEnvironment('HTTP_HOST', loadBalancer.loadBalancerDnsName);
      wordpressTaskDef.findContainer('wordpress')?.addEnvironment('SERVER_NAME', loadBalancer.loadBalancerDnsName);
    }
  }

  public get securityGroup(): SecurityGroup {
    return this._securityGroup;
  }
}


/**
 * "Clean sheet of paper" baseline that models aws recommended best practices.
 * Provides a "standard" deployment of this construct as one would conduct in an unconstrained aws account, accepting most defaults.
 * NOTE: This construct does not currently provide any public access to the fargate service.
 */
export class StandardWordpressConstruct extends WordpressEcsConstruct {
  adaptResourceProperties(): void { /* Do nothing */ }
  adaptResources(): void { /* Do nothing */ }
};

