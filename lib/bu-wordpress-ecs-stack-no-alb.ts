import { Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2  from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secretsmgr from 'aws-cdk-lib/aws-secretsmanager';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as logs from 'aws-cdk-lib/aws-logs';

declare const cluster: ecs.Cluster;

export class BuWordpressEcsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const context = scope.node.getContext('env');

    // Set the tags for the stack
    this.tags.setTag('Service', context.TAG_SERVICE);
    this.tags.setTag('Function', context.TAG_FUNCTION);
    this.tags.setTag('Landscape', context.TAG_LANDSCAPE);

    const secretForBucketUser: secretsmgr.ISecret = secretsmgr.Secret.fromSecretNameV2(this, 'bucket-secret', context.BUCKET_USER_SECRET_NAME);
    const service = 's3-object-lambda'
    const host=`${context.OLAP}-${context.ACCOUNT}.${service}.${context.REGION}.amazonaws.com`;

    // Create a aws_ec2.SubnetSelection comprising 2 subnets whose ids are provided.
    const stack = this;
    const subsln: ec2.SubnetSelection = new class subsln implements ec2.SubnetSelection {
      subnets = [
        ec2.Subnet.fromSubnetId(stack, 'subnet1', context.CAMPUS_SUBNET1),
        ec2.Subnet.fromSubnetId(stack, 'subnet2', context.CAMPUS_SUBNET2)
      ];
    };

    const vpc = ec2.Vpc.fromLookup(this, 'BuVpc', {
      vpcId: context.VPC_ID,
    });

    const cluster = new ecs.Cluster(this, "WordpressCluster", {
      vpc: vpc, 
      containerInsights: true,
      clusterName: 'wordpress-cluster',
      
    });

    const sg = new ec2.SecurityGroup(this, 'LaunchTemplateSG', {
      vpc: vpc,
      allowAllOutbound: true        
    });
    // Add campus vpn subnet ingress rules
    sg.addEgressRule(ec2.Peer.ipv4('168.122.81.0/24'), ec2.Port.tcp(8080));
    sg.addEgressRule(ec2.Peer.ipv4('168.122.82.0/23'), ec2.Port.tcp(8080));
    sg.addEgressRule(ec2.Peer.ipv4('168.122.76.0/24'), ec2.Port.tcp(8080));
    sg.addEgressRule(ec2.Peer.ipv4('168.122.68.0/24'), ec2.Port.tcp(8080));
    sg.addEgressRule(ec2.Peer.ipv4('168.122.69.0/24'), ec2.Port.tcp(8080));
    // Add dv02 ingress rule
    sg.addEgressRule(ec2.Peer.ipv4('10.231.32.200/32'), ec2.Port.tcp(8080));


    const asg = new autoscaling.AutoScalingGroup(this, 'wordpress-asg', {
      vpc,
      vpcSubnets: subsln,
      // launchTemplate: launchTemplate,
      instanceType: new ec2.InstanceType('t3.small'),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
      desiredCapacity: 1,
      minCapacity: 1,
      maxCapacity: 2,
      newInstancesProtectedFromScaleIn: false,
      autoScalingGroupName: 'wordpress-asg',
      securityGroup: sg,
      // healthCheck: autoscaling.HealthCheck.ec2({grace: Duration.seconds(30)}),
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate(
        {
          maxBatchSize: 1,
          minInstancesInService: 1,
          minSuccessPercentage: 100,
          pauseTime: Duration.minutes(5),
          suspendProcesses: [
            autoscaling.ScalingProcess.AZ_REBALANCE,
            autoscaling.ScalingProcess.HEALTH_CHECK,
            autoscaling.ScalingProcess.SCHEDULED_ACTIONS,
            autoscaling.ScalingProcess.ALARM_NOTIFICATION,
            autoscaling.ScalingProcess.REPLACE_UNHEALTHY
          ],
          waitOnResourceSignals: false,
        }
      )
    });

    const capacityProvider = new ecs.AsgCapacityProvider(this, 's3proxy-asg-capacity-provider', {
      autoScalingGroup: asg,
      enableManagedTerminationProtection: false      
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    const taskdef = new ecs.Ec2TaskDefinition(this, 's3proxy-taskdef', {
      family: 's3proxy',
    });    
    taskdef.addContainer('s3-proxy', {
      image: ecs.ContainerImage.fromRegistry(context.DOCKER_IMAGE_V4SIG),
      memoryLimitMiB: 1024,
      containerName: 's3-proxy',
      // healthCheck: {
      //   command: [ "CMD-SHELL", "echo disabled_healthcheck" ],
      //   interval: Duration.seconds(7),
      //   retries: 3,
      //   startPeriod: Duration.seconds(10),
      //   timeout: Duration.seconds(5)
      // },
      command: [
        '-v',
        '--name', service,
        '--host', host,
        '--region', context.REGION,
        '--no-verify-ssl'
      ],
      portMappings: [
        {
          containerPort: 8080,
          hostPort: 8080,
          protocol: ecs.Protocol.TCP
        },
      ],
      logging: ecs.LogDriver.awsLogs({ 
        logGroup: new logs.LogGroup(this, 'wordpress-log-group', {
          removalPolicy: RemovalPolicy.DESTROY
        }),        
        streamPrefix: 's3proxy'
      }),
      secrets: {
        AWS_ACCESS_KEY_ID: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_access_key_id'),
        AWS_SECRET_ACCESS_KEY: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_secret_access_key'),
        AWS_REGION: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_region')
      }
    });

    new ecs.Ec2Service(this, 'EC2Service', {
      cluster,      
      taskDefinition: taskdef,      
      desiredCount: 1,
      minHealthyPercent: 50,
      maxHealthyPercent: 100,
      circuitBreaker: { rollback: true },
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS
      }, 
      placementStrategies: [
        ecs.PlacementStrategy.spreadAcrossInstances()
      ],
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          base: 1,
          weight: 1
        }
      ],
    });
  }


}
