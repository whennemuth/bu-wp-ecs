import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AdaptableConstruct } from './AdaptableFargateService';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

export class WordpressAppContainerDefConfig {

  public static HOST_PORT: number = 443;
  public static CONTAINER_PORT: number = this.HOST_PORT;

  public getProperties(scope: AdaptableConstruct) : ecs.ContainerDefinitionOptions {

    const getRdsHost = () => {
      if(scope?.props?.rdsHostName) {
        return scope?.props?.rdsHostName;
      }
      if(scope.context.WORDPRESS.env?.dbHost) {
        return scope.context.WORDPRESS.env?.dbHost;
      }
      return 'db';
    }
    
    return {
      image: ecs.ContainerImage.fromRegistry(scope.context.WORDPRESS.dockerImage),
      containerName: scope.id,
      memoryReservationMiB: 1024,
      healthCheck: {
        command: [ 'CMD-SHELL', 'echo hello' ],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(5),
        retries: 3
      },
      portMappings: [
        {
          containerPort: WordpressAppContainerDefConfig.HOST_PORT,
          hostPort: WordpressAppContainerDefConfig.HOST_PORT,
          protocol: ecs.Protocol.TCP
        },
        {
          containerPort: 80,
          hostPort: 80,
          protocol: ecs.Protocol.TCP
        },
      ],
      logging: ecs.LogDriver.awsLogs({ 
        logGroup: new LogGroup(scope, `${scope.id}-logs`, {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_MONTH
        }),
        streamPrefix: scope.id,
      }),
      environment: {
        SERVER_NAME: scope.context.WORDPRESS.env.serverName,
        SP_ENTITY_ID: scope.context.WORDPRESS.env.spEntityId,
        IDP_ENTITY_ID: scope.context.WORDPRESS.env.idpEntityId,
        TZ: scope.context.WORDPRESS.env.TZ,
        S3PROXY_HOST: scope.context.WORDPRESS.env.s3ProxyHost || 'localhost',
        FORWARDED_FOR_HOST: scope.context.WORDPRESS.env.forwardedForHost,
        WORDPRESS_DB_HOST: getRdsHost(),
        WORDPRESS_DB_USER: scope.context.WORDPRESS.env.dbUser || 'root',
        WORDPRESS_DB_NAME: scope.context.WORDPRESS.env.dbName || 'wp_db',
        WORDPRESS_DEBUG: scope.context.WORDPRESS.env.debug || 'true'
      },
      // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
      secrets: {
        WORDPRESS_CONFIG_EXTRA: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            scope.context.WORDPRESS.secret.fields.configExtra, 
            scope.context.WORDPRESS.secret.arn),
          scope.context.WORDPRESS.secret.fields.configExtra,   
        ),
        WORDPRESS_DB_PASSWORD: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            scope.context.WORDPRESS.secret.fields.dbPassword, 
            scope.context.WORDPRESS.secret.arn),
          scope.context.WORDPRESS.secret.fields.dbPassword,  
        ),
        SHIB_SP_KEY: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            scope.context.WORDPRESS.secret.fields.spKey, 
            scope.context.WORDPRESS.secret.arn),
          scope.context.WORDPRESS.secret.fields.spKey,  
        ),
        SHIB_SP_CERT: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            scope.context.WORDPRESS.secret.fields.spCert, 
            scope.context.WORDPRESS.secret.arn),
          scope.context.WORDPRESS.secret.fields.spCert,  
        ),        
      }
    }
  }
}