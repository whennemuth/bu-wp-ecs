import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AdaptableConstruct } from './AdaptableFargateService';
import { LogGroup } from 'aws-cdk-lib/aws-logs';

const olap_service: string = 's3-object-lambda';

export class WordpressS3ProxyContainerDefConfig {

  public static HOST_PORT: number = 8080;
  prefix: string;

  public getProperties(scope: AdaptableConstruct) : ecs.ContainerDefinitionOptions {

    const secretForBucketUser: ISecret = Secret.fromSecretNameV2(
      scope, 'bucket-secret',  scope.context.S3PROXY.bucketUserSecretName
    );
    
    const host=`${scope.context.S3PROXY.OLAP}.${olap_service}.${scope.context.REGION}.amazonaws.com`;
    const prfx = this.prefix || scope.id;
    const { HOST_PORT:hostPort, HOST_PORT:containerPort } = WordpressS3ProxyContainerDefConfig;

    return {
      image: ecs.ContainerImage.fromRegistry(scope.context.S3PROXY.dockerImage),
      containerName: prfx,
      // memoryLimitMiB: 512,
      memoryReservationMiB: 256,
      healthCheck: {
        command: [ 'CMD-SHELL', 'echo hello' ],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(5),
        retries: 3
      },
      command: [
        '-v',
        '--name', 's3-object-lambda',
        '--host', host,
        '--region', scope.context.REGION,
        '--no-verify-ssl'
      ],
      portMappings: [{
        hostPort,
        containerPort,
        protocol: ecs.Protocol.TCP
      }],
      logging: ecs.LogDriver.awsLogs({ 
        logGroup: new LogGroup(scope.scope, `${prfx}-logs`, {
          removalPolicy: RemovalPolicy.DESTROY
        }),
        streamPrefix: prfx
      }),
      environment: {
        healthcheck_path: '/s3proxy-healthcheck'        
      },
      secrets: {
        AWS_ACCESS_KEY_ID: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_access_key_id'),
        AWS_SECRET_ACCESS_KEY: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_secret_access_key'),
        AWS_REGION: ecs.Secret.fromSecretsManager(secretForBucketUser, 'aws_region')
      }
    }
  }

  setPrefix(prefix: string): WordpressS3ProxyContainerDefConfig {
    this.prefix = prefix;
    return this;
  }
}