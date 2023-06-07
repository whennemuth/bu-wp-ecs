import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2  from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secretsmgr from 'aws-cdk-lib/aws-secretsmanager';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';

const prefix: string = 's3proxy';
const sigv4_prefix: string = 's3proxy';
const sigv4_host_port = 8080;
const sigv4_container_port = sigv4_host_port;
const sigv4_healthcheck = '/s3proxy-healthcheck';
const olap_service: string = 's3-object-lambda';

export class BuWordpressEcsStack extends Stack {

  private context: any;
  private vpc: ec2.IVpc;
  private subsln: ec2.SubnetSelection;
  private cluster: ecs.Cluster;
  private securityGroups: any;
  private asg: autoscaling.AutoScalingGroup;
  private capacityProvider: ecs.AsgCapacityProvider;
  private taskdef: ecs.Ec2TaskDefinition;
  private alb: elbv2.ApplicationLoadBalancer;
  private sslListener: elbv2.ApplicationListener;
  private s3proxyTargetGroup: elbv2.ApplicationTargetGroup;
  private s3ProxyService: ecs.Ec2Service;

  constructor(scope: Construct, id: string, props?: StackProps) {

    super(scope, id, props);

    const stack: BuWordpressEcsStack = this;

    stack.context = scope.node.getContext('stack-parms');

    stack.setStackTags(stack);

    stack.vpc = ec2.Vpc.fromLookup(stack, 'BuVpc', { vpcId: stack.context.VPC_ID });

    stack.setSubnets(stack);

    stack.setCluster(stack);

    stack.setSecurityGroups(stack);

    stack.setAutoscalingGroup(stack);

    stack.addCapacityProviderToCluster(stack);

    stack.setTaskDef(stack);

    stack.setEc2Service(stack);

    stack.setExtraEc2ServiceScaling(stack);

    stack.setLoadBalancer(stack);

    stack.configureLoadBalancer(stack);
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

  private setCluster(stack: BuWordpressEcsStack) {
    stack.cluster = new ecs.Cluster(stack, `${prefix}-cluster`, {
      vpc: stack.vpc, 
      containerInsights: true,
      clusterName: `${prefix}-cluster` 
    });
  }

  private setSubnets(stack: BuWordpressEcsStack) {
    stack.subsln = new class subsln implements ec2.SubnetSelection {
      subnets = [
        ec2.Subnet.fromSubnetId(stack, 'subnet1', stack.context.CAMPUS_SUBNET1),
        ec2.Subnet.fromSubnetId(stack, 'subnet2', stack.context.CAMPUS_SUBNET2)
      ];
    }
  }

  private setSecurityGroups(stack: BuWordpressEcsStack) {
    const alb_sg = new ec2.SecurityGroup(stack, `${prefix}-alb-sg`, {
      vpc: stack.vpc, 
      allowAllOutbound: true
    });
    const ingressPort = this.useSSL(stack) ? 443 : sigv4_host_port;

    // Add campus vpn subnet ingress rules
    alb_sg.addIngressRule(ec2.Peer.ipv4('168.122.81.0/24'), ec2.Port.tcp(ingressPort));
    alb_sg.addIngressRule(ec2.Peer.ipv4('168.122.82.0/23'), ec2.Port.tcp(ingressPort));
    alb_sg.addIngressRule(ec2.Peer.ipv4('168.122.76.0/24'), ec2.Port.tcp(ingressPort));
    alb_sg.addIngressRule(ec2.Peer.ipv4('168.122.68.0/24'), ec2.Port.tcp(ingressPort));
    alb_sg.addIngressRule(ec2.Peer.ipv4('168.122.69.0/24'), ec2.Port.tcp(ingressPort));
    // Add dv02 ingress rule
    alb_sg.addIngressRule(ec2.Peer.ipv4('10.231.32.200/32'), ec2.Port.tcp(ingressPort));

    const ec2_sg = new ec2.SecurityGroup(stack, `${prefix}-ec2-sg`, {
      vpc: stack.vpc,
      allowAllOutbound: true        
    });
    ec2_sg.addIngressRule(ec2.Peer.securityGroupId(alb_sg.securityGroupId), ec2.Port.allTraffic());

    stack.securityGroups = {
      alb: alb_sg,
      ec2: ec2_sg
    };
  }

  /**
   * Configure the auto scaling group (asg).
   * @param stack 
   */
  private setAutoscalingGroup(stack: BuWordpressEcsStack) {
    stack.asg = new autoscaling.AutoScalingGroup(stack, `${prefix}-asg`, {
      vpc: stack.vpc,
      vpcSubnets: stack.subsln,
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      desiredCapacity: 2,
      minCapacity: 1,
      maxCapacity: 3,
      cooldown: Duration.minutes(2),
      instanceMonitoring: autoscaling.Monitoring.DETAILED,
      newInstancesProtectedFromScaleIn: false,
      allowAllOutbound: true,
      autoScalingGroupName: `${prefix}-asg`,
      securityGroup: stack.securityGroups.ec2,
      defaultInstanceWarmup: Duration.seconds(30),
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate(
        {
          maxBatchSize: 1,
          minInstancesInService: 1,
          minSuccessPercentage: 100,
          waitOnResourceSignals: false,
          pauseTime: Duration.seconds(15), // https://repost.aws/knowledge-center/auto-scaling-group-rolling-updates
          suspendProcesses: [
            autoscaling.ScalingProcess.AZ_REBALANCE,
            autoscaling.ScalingProcess.HEALTH_CHECK,
            autoscaling.ScalingProcess.SCHEDULED_ACTIONS,
            autoscaling.ScalingProcess.ALARM_NOTIFICATION,
            autoscaling.ScalingProcess.REPLACE_UNHEALTHY
          ],
        }
      ),
    });
  }

  /**
   * The asg will be associated with a capacity provider. This means that autoscaling at the cluster level is 
   * abstracted away and affected obliquely by ECS as a function of scaling events that are configured at the service level.
   * If this is combined with enabling managed scaling on the capacity provider, alarms or scaling policies are 
   * automatically created for you. "Just concentrating on tasks" like this is covered in the following references:
   * 
   * https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-auto-scaling.html
   * and...
   * https://aws.amazon.com/blogs/containers/deep-dive-on-amazon-ecs-cluster-auto-scaling/
   * @param stack 
   */
  private addCapacityProviderToCluster(stack: BuWordpressEcsStack) {
    stack.capacityProvider = new ecs.AsgCapacityProvider(stack, `${prefix}-asg-capacity-provider`, {
      autoScalingGroup: stack.asg,
      enableManagedTerminationProtection: false,
      enableManagedScaling: true,
      machineImageType: ecs.MachineImageType.AMAZON_LINUX_2,
    });
    // https://repost.aws/knowledge-center/ecs-capacity-provider-error
    stack.cluster.addAsgCapacityProvider(stack.capacityProvider, { canContainersAccessInstanceRole: true });
  }

  private setTaskDef(stack: BuWordpressEcsStack) {
    stack.taskdef = new ecs.Ec2TaskDefinition(stack, `${sigv4_prefix}-taskdef`, {
      family: `${sigv4_prefix}`   
    });
    
    const secretForBucketUser: secretsmgr.ISecret = secretsmgr.Secret.fromSecretNameV2(stack, 'bucket-secret', stack.context.BUCKET_USER_SECRET_NAME);
    const host=`${stack.context.OLAP}-${stack.context.ACCOUNT}.${olap_service}.${stack.context.REGION}.amazonaws.com`;
    stack.taskdef.addContainer(`${sigv4_prefix}`, {
      image: ecs.ContainerImage.fromRegistry(stack.context.DOCKER_IMAGE_V4SIG),
      // memoryLimitMiB: 512,
      memoryReservationMiB: 256,
      containerName: `${sigv4_prefix}`,
      healthCheck: {
        command: [ 'CMD-SHELL', 'echo hello' ],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(5),
        retries: 3
      },
      command: [
        '-v',
        '--name', olap_service,
        '--host', host,
        '--region', stack.context.REGION,
        '--no-verify-ssl'
      ],
      portMappings: [
        {
          containerPort: sigv4_container_port,
          hostPort: sigv4_host_port,
          protocol: ecs.Protocol.TCP
        },
      ],
      logging: ecs.LogDriver.awsLogs({ 
        logGroup: new logs.LogGroup(stack, `${sigv4_prefix}-logs`, {
          removalPolicy: RemovalPolicy.DESTROY
        }),
        streamPrefix: `${sigv4_prefix}`
      }),
      environment: {
        healthcheck_path: sigv4_healthcheck
      },
      secrets: {
        AWS_ACCESS_KEY_ID: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_access_key_id'),
        AWS_SECRET_ACCESS_KEY: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_secret_access_key'),
        AWS_REGION: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_region')
      }
    });
  }

  /**
   * Create the ECS service.
   * NOTE: The spread placement strategy is used in order to maximize availability.
   * However, if one of the binpack variants were to be used, this would most efficiently place tasks based on 
   * resource consumption and potentially reduce the number of container instances that would need to be in service (cost-optimization).
   * @param stack 
   */
  private setEc2Service(stack: BuWordpressEcsStack) {
    stack.s3ProxyService = new ecs.Ec2Service(stack, `${prefix}-ec2-service`, {
      cluster: stack.cluster, 
      taskDefinition: stack.taskdef,      
      desiredCount: 2,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      enableECSManagedTags: true,
      propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS
      },
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances()
      ],
      capacityProviderStrategies: [
        {
          capacityProvider: stack.capacityProvider.capacityProviderName,
          base: 1,
          weight: 1
        }
      ],
    });
  }

  /**
   * Set the conditions on which the number of tasks for the service is 
   * increased or decreased based on resource consumption levels and scheduling
   * @param stack 
   */
  private setExtraEc2ServiceScaling(stack: BuWordpressEcsStack) {
    const stc: ecs.ScalableTaskCount = stack.s3ProxyService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10
    });

    stc.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: Duration.minutes(1),
      scaleOutCooldown: Duration.minutes(1),      
    });

    stc.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 90,
      scaleInCooldown: Duration.minutes(1),
      scaleOutCooldown: Duration.minutes(1),      
    });

    /**
     * Scheduled scaling may not be necessary if the metrics-based scaling scales down to the same capacity anyway due to the
     * reduced load during those off-peak times. This is more likely to be the case the higher one sets the target utilization 
     * percentages, limiting excess capacity and packing more "tightly".
     */
    stc.scaleOnSchedule('WorkDayMorningScaleUp', {
      schedule: appscaling.Schedule.cron({ hour: '8', minute: '0', weekDay: '1-5' }),
      minCapacity: 2
    });
    stc.scaleOnSchedule('WorkDayEveningScaleDown', {
      schedule: appscaling.Schedule.cron({ hour: '20', minute: '0', weekDay: '1-5' }),
      minCapacity: 1
    });
  }

  private setLoadBalancer(stack: BuWordpressEcsStack) {
    const bucket: s3.IBucket = new s3.Bucket(stack, `${prefix}-alb-access-logs`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED
    });

    stack.alb = new elbv2.ApplicationLoadBalancer(stack, `${prefix}-alb`, {
       vpc: stack.vpc, 
       internetFacing: false,
       securityGroup: stack.securityGroups.alb,
       vpcSubnets: stack.subsln
    }); 

    stack.alb.logAccessLogs(bucket);
  }

  /**
   * Create target groups, security groups, listeners, and dns routing for the ALB
   * @param stack The Stack construct in scope
   */
  private configureLoadBalancer(stack: BuWordpressEcsStack) {

    let listener_certificates: elbv2.IListenerCertificate[] = [];
    let listener_port = sigv4_host_port;

    if(this.useSSL(stack)) {
      const hostedZone = route53.HostedZone.fromLookup(stack, 'Zone', { domainName: stack.context.HOSTED_ZONE });
      new route53.ARecord(stack, 'AliasRecord', {
        zone: hostedZone,
        recordName: stack.context.RECORD_NAME,
        target: route53.RecordTarget.fromAlias(new LoadBalancerTarget(stack.alb))
      });

      listener_port = 443;
      listener_certificates.push({ certificateArn: stack.context.CERTIFICATE_ARN });
    }

    stack.sslListener = stack.alb.addListener(`${sigv4_prefix}-listener'`, { 
      port: listener_port,
      certificates: listener_certificates,
      // Do this default action if none of the target group conditions are met.
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: '404 Error: Page not found'
      }),
      open: false
    });

    // Attach the s3proxy service to alb
    stack.s3proxyTargetGroup = stack.sslListener.addTargets(`${sigv4_prefix}-tg`, {
      port: sigv4_host_port,
      targets: [ stack.asg ],
      loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([
          '/*/files/*',
          '/*/*/files/*',
          sigv4_healthcheck
        ])
      ]
    });
    
    stack.s3proxyTargetGroup.configureHealthCheck({
      path: sigv4_healthcheck,
      port: `${sigv4_container_port}`,
      healthyHttpCodes: '200-299',
      healthyThresholdCount: 3,
      interval: Duration.seconds(10),
    });
  }
}