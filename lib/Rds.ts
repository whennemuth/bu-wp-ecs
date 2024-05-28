import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, Peer, Port, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2";
import { AuroraCapacityUnit, AuroraMysqlEngineVersion, CfnDBCluster, CfnDBInstance, ClusterInstance, Credentials, DatabaseCluster, DatabaseClusterEngine, DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, ServerlessCluster, } from 'aws-cdk-lib/aws-rds';
import { CnameRecord, HostedZone } from 'aws-cdk-lib/aws-route53';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { IContext, WORDPRESS_DB_TYPE } from '../contexts/IContext';

export class BuWordpressRdsConstruct extends Construct {

  private context: IContext;
  private rdsSocketAddress: string;
  private dnsRecordAddress: string;
  private securityGroup: SecurityGroup;
  private port: number;
  private props: any;
  private id: string;

  constructor(scope: Construct, id: string, props?: any) {

    super(scope, id);

    this.context = scope.node.getContext('stack-parms');
    this.port = Number.parseInt(this.context.WORDPRESS.env?.dbPort ?? '3306');
    this.props = props;
    this.id = id;

    this.build();
  }

  private build = () => {
    const { id, context, context: { TAGS } } = this;
    const dbType = context.WORDPRESS.env.dbType ?? WORDPRESS_DB_TYPE.SERVERLESS;
    const hostedZone = context?.DNS?.hostedZone;
    const addRecordToHostedZone = context?.DNS?.includeRDS;
    const { vpc } = this.props;

    const credentials: Credentials = Credentials.fromSecret(
      Secret.fromSecretCompleteArn(this, `${id}-secret`, context.WORDPRESS.secret.arn),
      context.WORDPRESS.env.dbUser
    );

    this.securityGroup = new SecurityGroup(this, `${id}-mysql-sg`, {
      vpc, 
      securityGroupName: `wp-rds-mysql-${TAGS.Landscape}-sg`,
      description: 'Allows for ingress to the wordpress rds db from ecs tasks and selected vpn subnets.',
      allowAllOutbound: true,
    });

    switch(dbType) {

      case WORDPRESS_DB_TYPE.INSTANCE:
        const di: DatabaseInstance = new DatabaseInstance(this, `${id}-mysql-instance`, {
          vpc,
          vpcSubnets: { subnetType: SubnetType.PUBLIC },
          engine: DatabaseInstanceEngine.mysql({
            version: MysqlEngineVersion.VER_5_7
          }),
          // enablePerformanceInsights: true,
          copyTagsToSnapshot: true,
          databaseName: context.WORDPRESS.env.dbName,
          credentials,
          instanceType: InstanceType.of( InstanceClass.T3, InstanceSize.SMALL ),
          securityGroups: [ this.securityGroup ],
          publiclyAccessible: true,
          removalPolicy: RemovalPolicy.DESTROY,
        }); 
        this.rdsSocketAddress = di.instanceEndpoint.socketAddress;   
        break;

      case WORDPRESS_DB_TYPE.CLUSTER: 
        const dc: DatabaseCluster = new DatabaseCluster(this, `${id}-mysql-cluster`, {
          vpc,
          vpcSubnets: { subnetType: SubnetType.PUBLIC },
          engine: DatabaseClusterEngine.auroraMysql({
            version: AuroraMysqlEngineVersion.VER_2_11_3,
            // version: AuroraMysqlEngineVersion.of('5.7.mysql_aurora.2.11.3'),        
          }),
          readers: [
            ClusterInstance.serverlessV2(`${id}-mysql-reader`, {
              publiclyAccessible: true,
              scaleWithWriter: true,
              instanceIdentifier: `${id}-mysql-reader-instance`
            })
          ],
          writer: ClusterInstance.serverlessV2(`${id}-mysql-writer`, {
            publiclyAccessible: true,
            enablePerformanceInsights: true,
            instanceIdentifier: `${id}-mysql-writer-instance`
          }),
          serverlessV2MinCapacity: AuroraCapacityUnit.ACU_1,
          serverlessV2MaxCapacity: AuroraCapacityUnit.ACU_8,
          copyTagsToSnapshot: true,
          defaultDatabaseName: context.WORDPRESS.env.dbName,
          credentials,
          securityGroups: [ this.securityGroup ],
          removalPolicy: RemovalPolicy.DESTROY,
        });
        // var cfnDBCluster = dc.node.defaultChild as CfnDBCluster;
        // cfnDBCluster.addPropertyOverride('PubliclyAccessible', true);
        this.rdsSocketAddress = dc.clusterEndpoint.socketAddress;
        break;

      case WORDPRESS_DB_TYPE.SERVERLESS:
        const sc: ServerlessCluster = new ServerlessCluster(this, `${id}-mysql-cluster`, {
          vpc,
          vpcSubnets: { subnetType: SubnetType.PUBLIC },
          //aws rds describe-orderable-db-instance-options --engine aurora-mysql --db-instance-class db.serverless --region us-east-2
          engine: DatabaseClusterEngine.auroraMysql({
            version: AuroraMysqlEngineVersion.VER_3_04_0,
          }),
          copyTagsToSnapshot: true,
          defaultDatabaseName: context.WORDPRESS.env.dbName,
          backupRetention: Duration.days(7),
          credentials,
          securityGroups: [ this.securityGroup ],
          removalPolicy: RemovalPolicy.DESTROY,
        });

        // The CDK doesn't seem to have caught up with V2 of mysql/aurora serverless, so some escape hatches...
        var cfnDBCluster = sc.node.defaultChild as CfnDBCluster;
        cfnDBCluster.addPropertyOverride('ServerlessV2ScalingConfiguration.MinCapacity', AuroraCapacityUnit.ACU_1);
        cfnDBCluster.addPropertyOverride('ServerlessV2ScalingConfiguration.MaxCapacity', AuroraCapacityUnit.ACU_8);
        cfnDBCluster.addPropertyDeletionOverride('EngineMode');
        cfnDBCluster.addPropertyDeletionOverride('StorageEncrypted');
        
        new CfnDBInstance(this, `${id}-mysql-cluster-instance`, {
          engine: 'aurora-mysql',
          dbInstanceClass: 'db.serverless',
          dbClusterIdentifier: sc.clusterIdentifier,
          publiclyAccessible: true       
        });

        this.rdsSocketAddress = sc.clusterEndpoint.socketAddress;
        break;
    }

    // Add a CNAME to the hosted zone indicated in the context record in order to enable dns routing to the db instance/cluster.
    if(hostedZone && addRecordToHostedZone) {
      this.dnsRecordAddress = `${TAGS.Landscape}.db.${hostedZone}`;
      new CnameRecord(this, `${id}-mysql-cname`, {
        domainName: this.rdsSocketAddress,
        zone: HostedZone.fromLookup(this, `${id}-mysql-hostedzone`, { domainName: hostedZone }),
        recordName: this.dnsRecordAddress,
        ttl: Duration.seconds(300)
     });
    }
  }

  /**
   * Get the endpoint address for use in establishing database connections.
   */
  public get endpointAddress(): string { 
    const { dnsRecordAddress, rdsSocketAddress } = this;
    return dnsRecordAddress || rdsSocketAddress;
  }

  /**
   * Add an ingress rule to the rds security group to allow ingress from other resources/cidrs.
   * @param sg The security group whose members are being granted ingress through the rds instance/service security group.
   */
  public addSecurityGroupIngressTo(securityGroupId: string): void {
    const { securityGroup, port } = this;
    securityGroup.addIngressRule(Peer.securityGroupId(securityGroupId), Port.tcp(port));
  }
}