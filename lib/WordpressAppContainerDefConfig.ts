import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { IContext } from '../contexts/IContext';
import { AdaptableConstruct } from './AdaptableFargateService';
import { WordpressS3ProxyContainerDefConfig } from './WordpressS3ProxyContainerDefConfig';

export class WordpressAppContainerDefConfig {

  public static HOST_PORT: number = 80;
  public static SSL_HOST_PORT: number = 443;

  public static DEFAULT_DB_USER:string = 'root';
  public static DEFAULT_DB_NAME:string = 'wp_db';
  public static DEFAULT_DB_HOST:string = 'db';

  public getProperties(scope: AdaptableConstruct) : ecs.ContainerDefinitionOptions {

    const { context, props } = scope;
    const { WORDPRESS:wp } = context as IContext;
    const { HOST_PORT:hostPort, SSL_HOST_PORT:sslHostPort, DEFAULT_DB_HOST, DEFAULT_DB_NAME, DEFAULT_DB_USER } = WordpressAppContainerDefConfig;
    const { HOST_PORT:s3ProxyHostPort } = WordpressS3ProxyContainerDefConfig;

    const getRdsHost = () => {
      if(props?.rdsHostName) {
        return props?.rdsHostName;
      }
      if(wp.env?.dbHost) {
        return wp.env?.dbHost;
      }
      return DEFAULT_DB_HOST;
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

    // Define the container environment variables
    const { 
      TZ='America/New_York', 
      spEntityId:SP_ENTITY_ID='', 
      idpEntityId:IDP_ENTITY_ID='', 
      s3ProxyHost:S3PROXY_HOST=`http://localhost:${s3ProxyHostPort}`, 
      dbUser:WORDPRESS_DB_USER=DEFAULT_DB_USER,
      dbName:WORDPRESS_DB_NAME=DEFAULT_DB_NAME, 
      dbHost:WORDPRESS_DB_HOST=getRdsHost(),
      debug='0', // Default to debug off
    } = wp.env;
    const WORDPRESS_DEBUG = `${debug}`;
    const WP_CLI_ALLOW_ROOT = 'true';

    // Define the contaier secrets
    const {
      arn:secretArn, fields: { configExtra, dbPassword, spCert, spKey }
    } = wp.secret;
    
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
        SP_ENTITY_ID, IDP_ENTITY_ID, TZ, S3PROXY_HOST, WORDPRESS_DB_HOST,
        WORDPRESS_DB_USER, WORDPRESS_DB_NAME, WORDPRESS_DEBUG, WP_CLI_ALLOW_ROOT
      },
      // https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
      secrets: {
        WORDPRESS_CONFIG_EXTRA: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(scope, configExtra, secretArn), configExtra),
        WORDPRESS_DB_PASSWORD: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(scope, dbPassword, secretArn), dbPassword),
        SHIB_SP_KEY: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(scope, spKey, secretArn), spKey),
        SHIB_SP_CERT: ecs.Secret.fromSecretsManager(
          Secret.fromSecretCompleteArn(scope, spCert, secretArn), spCert),        
      }
    } as ecs.ContainerDefinitionOptions
  }
}