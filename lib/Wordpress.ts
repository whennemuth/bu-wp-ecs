import { AdaptableConstruct, FargateService } from './AdaptableFargateService';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { PropagatedTagSource, FargateTaskDefinition, ContainerDefinitionOptions, Cluster } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService as albfs } from 'aws-cdk-lib/aws-ecs-patterns';
import { WordpressAppContainerDefConfig } from './WordpressAppContainerDefConfig';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { SCENARIO as scenarios } from '../contexts/IContext';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

import { CfnCacheCluster, CfnSubnetGroup } from 'aws-cdk-lib/aws-elasticache';
import { Peer, Port } from 'aws-cdk-lib/aws-ec2';

/**
 * Baseline class for the wordpresss application load balanced fargate service.
 * Subclasses will "adapt" this baseline in order to customize it. 
 */
export abstract class WordpressEcsConstruct extends AdaptableConstruct implements FargateService {

  private _sidecarContainerDefProps: ContainerDefinitionOptions;
  private _securityGroup: SecurityGroup;
  private _redisCluster: CfnCacheCluster;
  private _redisClusterProps: any;
  
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

    this._securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(6379), 'Allow inbound TCP traffic on the Redis port');
    
    this.fargateServiceProps = {
      serviceName: `${this.id}-service-${this.context.TAGS.Landscape}`,
      cluster: new Cluster(this, `${this.id}-cluster`, {
        clusterName: `${this.id}-cluster-${this.context.TAGS.Landscape}`,
        containerInsights: true,
        vpc: this.getVpc()
      }),
      enableExecuteCommand: true,
      loadBalancerName: `${this.id}-fargate-alb`,
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
    };

    const vpc = this.getVpc();

    // Make a subnet group for the redis cluster.
    const redisSubnetGroup = new CfnSubnetGroup(this, `${this.id}-redis-subnet-group`, {
      description: 'Subnet group for the redis cluster.',
      subnetIds: vpc.privateSubnets.map( subnet => subnet.subnetId ),
      cacheSubnetGroupName: `${this.id}-redis-subnet-group-name`,
    });

    // Setup properties for the redis cluster.
    this._redisClusterProps = {
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [ this._securityGroup.securityGroupId ],
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
    };

    // Create the redis cluster, only after the subnet group is created.
    this._redisCluster = new CfnCacheCluster(this, `${this.id}-redis-cluster`, this._redisClusterProps);
    this._redisCluster.addDependency(redisSubnetGroup);
  }

  buildResources(): void {

    this.setStackTags();

    const wordpressTaskDef = new FargateTaskDefinition(this, `${this.id}-taskdef`, this.taskDefProps);

    wordpressTaskDef.addContainer(`${this.id}-taskdef-wp`, {
      ...this.containerDefProps,
      environment: {
        ...this.containerDefProps.environment,
        REDIS_HOST: this._redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: this._redisCluster.attrRedisEndpointPort,
      },
    });

    if(this.includeSidecar()) {
      wordpressTaskDef.addContainer(`${this.id}-taskdef-s3proxy`, this._sidecarContainerDefProps);
    }

    this.fargateService = new albfs(
      this, `${this.id}-fargate-service`, 
      Object.assign(this.fargateServiceProps, { taskDefinition: wordpressTaskDef } )
    );

    this.fargateService.targetGroup.configureHealthCheck({
      path: this.healthcheck,
      healthyThresholdCount: 3,
      healthyHttpCodes: '200-299',
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
      ]
    }));
  }

  public get securityGroup(): SecurityGroup {
    return this._securityGroup;
  }

  public get redisCluster(): CfnCacheCluster {
    return this._redisCluster;
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
