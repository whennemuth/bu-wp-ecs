import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { AdaptableConstruct } from './AdaptableFargateService';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IContext } from '../contexts/IContext';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';

export class WordpressAppContainerDefConfig {

  public static HOST_PORT: number = 80;
  public static SSL_HOST_PORT: number = 443;

  public getProperties(scope: AdaptableConstruct) : ecs.ContainerDefinitionOptions {

    const { context } = scope;
    const { WORDPRESS:wp } = context as IContext;
    const { HOST_PORT:hostPort, SSL_HOST_PORT:sslHostPort } = WordpressAppContainerDefConfig;
    const { HOST_PORT:s3ProxyHostPort } = WordpressS3ProxyContainerDefConfig;

    const getRdsHost = () => {
      if(scope?.props?.rdsHostName) {
        return scope?.props?.rdsHostName;
      }
      if(wp.env?.dbHost) {
        return wp.env?.dbHost;
      }
      return 'db';
    }

    // The container will ALWAYS be able to "talk" on port 80
    // NOTE: The host port must be left out or must be the same as the container port for AwsVpc or Host network mode.
    const portMappings = [{
      containerPort: hostPort,
      hostPort,
      protocol: ecs.Protocol.TCP
    }] as ecs.PortMapping[];

    // The container will be able to "talk" over SSL if requests are not routed from cloudfront, 
    // where cloudfront is performing ssl termination and viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS.
    if( ! context.DNS?.cloudfront) {
      portMappings.push({
        containerPort: sslHostPort,
        hostPort: sslHostPort,
        protocol: ecs.Protocol.TCP
      } as ecs.PortMapping)
    }
    
    return {
      image: ecs.ContainerImage.fromRegistry(wp.dockerImage),
      containerName: 'wordpress',
      memoryReservationMiB: 1024,
      healthCheck: {
        command: [ 'CMD-SHELL', 'echo hello' ],
        interval: Duration.seconds(10),
        startPeriod: Duration.seconds(5),
        retries: 3
      },
      portMappings,
      logging: ecs.LogDriver.awsLogs({ 
        logGroup: new LogGroup(scope, `${scope.id}-logs`, {
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_MONTH
        }),
        streamPrefix: scope.id,
      }),
      environment: {
        SP_ENTITY_ID: wp.env.spEntityId,
        IDP_ENTITY_ID: wp.env.idpEntityId,
        TZ: wp.env.TZ,
        S3PROXY_HOST: wp.env.s3ProxyHost || `http://localhost:${s3ProxyHostPort}`,
        FORWARDED_FOR_HOST: wp.env.forwardedForHost,
        WORDPRESS_DB_HOST: getRdsHost(),
        WORDPRESS_DB_USER: wp.env.dbUser || 'root',
        WORDPRESS_DB_NAME: wp.env.dbName || 'wp_db',
        WORDPRESS_DEBUG: `${wp.env.debug}`,
        WP_CLI_ALLOW_ROOT: 'true'
      },
      // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
      secrets: {
        WORDPRESS_CONFIG_EXTRA: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            wp.secret.fields.configExtra, 
            wp.secret.arn),
          wp.secret.fields.configExtra,   
        ),
        WORDPRESS_DB_PASSWORD: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            wp.secret.fields.dbPassword, 
            wp.secret.arn),
          wp.secret.fields.dbPassword,  
        ),
        SHIB_SP_KEY: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            wp.secret.fields.spKey, 
            wp.secret.arn),
          wp.secret.fields.spKey,  
        ),
        SHIB_SP_CERT: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(
            scope, 
            wp.secret.fields.spCert, 
            wp.secret.arn),
          wp.secret.fields.spCert,  
        ),        
      }
    }
  }
}