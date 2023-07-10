import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AdaptableConstruct } from './AdaptableFargateService';
import { LogGroup } from 'aws-cdk-lib/aws-logs';

export class WordpressAppContainerDefConfig {

  public static HOST_PORT: number = 443;

  public getProperties(scope: AdaptableConstruct) : ecs.ContainerDefinitionOptions {
    return {
      image: ecs.ContainerImage.fromRegistry(scope.context.WORDPRESS.dockerImage),
      containerName: scope.prefix,
      memoryReservationMiB: 1024,
      healthCheck: {
        command: [ 'CMD-SHELL', 'echo hello' ],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(5),
        retries: 3
      },
      portMappings: [{
        containerPort: WordpressAppContainerDefConfig.HOST_PORT,
        hostPort: WordpressAppContainerDefConfig.HOST_PORT,
        protocol: ecs.Protocol.TCP
      }],
      logging: ecs.LogDriver.awsLogs({ 
        logGroup: new LogGroup(scope, `${scope.prefix}-logs`, {
          removalPolicy: RemovalPolicy.DESTROY
        }),
        streamPrefix: scope.prefix
      }),
      environment: {
        SERVER_NAME: scope.context.WORDPRESS.env.serverName,
        SP_ENTITY_ID: scope.context.WORDPRESS.env.spEntityId,
        IDP_ENTITY_ID: scope.context.WORDPRESS.env.idpEntityId,
        TZ: scope.context.WORDPRESS.env.TZ,
        S3PROXY_HOST: scope.context.S3PROXY.recordName || 'localhost',
        FORWARDED_FOR_HOST: scope.context.WORDPRESS.env.forwardedForHost        
      },
      secrets: {
        WORDPRESS_CONFIG_EXTRA: ecs.Secret.fromSecretsManager(
          Secret.fromSecretNameV2(scope, 'wordpress-secret', scope.context.WORDPRESS.secrets.configExtra)
        )
      }
    }
  }
}