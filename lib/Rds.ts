import { Construct } from 'constructs';
import { DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, Credentials, CfnDBCluster, ClusterInstance, CfnDBInstance, } from 'aws-cdk-lib/aws-rds';
import { DatabaseCluster, DatabaseClusterEngine, AuroraMysqlEngineVersion } from 'aws-cdk-lib/aws-rds';
import { ServerlessCluster, AuroraCapacityUnit } from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { CnameRecord, HostedZone } from 'aws-cdk-lib/aws-route53';
import { IContext, WORDPRESS_DB_TYPE } from '../contexts/IContext';
import { Vpc, IpAddresses, SubnetType, SecurityGroup, Peer, Port, InstanceType, InstanceClass, InstanceSize }  from "aws-cdk-lib/aws-ec2";
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export class BuWordpressRdsConstruct extends Construct {

  private _context: IContext;
  private _rdsSocketAddress: string;
  private _dnsRecordAddress: string;
  private _securityGroup: SecurityGroup;
  private _port: number;
  private _props: any;
  private _vpc: Vpc;
  private _id: string;

  constructor(scope: Construct, id: string, props?: any) {

    super(scope, id);

    this._context = scope.node.getContext('stack-parms');
    this._port = Number.parseInt(this._context.WORDPRESS.env?.dbPort ?? '3306');
    this._props = props;
    this._id = id;
    const dbType = this._context.WORDPRESS.env.dbType ?? WORDPRESS_DB_TYPE.SERVERLESS;
    const hostedZone = this._context?.DNS?.hostedZone;
    const addRecordToHostedZone = this._context?.DNS?.includeRDS;

    const credentials: Credentials = Credentials.fromSecret(
      Secret.fromSecretCompleteArn(this, `${id}-secret`, this._context.WORDPRESS.secret.arn),
      this._context.WORDPRESS.env.dbUser
    );

    this._securityGroup = new SecurityGroup(this, `${id}-mysql-sg`, {
      vpc: this.vpc, 
      securityGroupName: `wp-rds-mysql-${this._context.TAGS.Landscape}-sg`,
      description: 'Allows for ingress to the wordpress rds db from ecs tasks and selected vpn subnets.',
      allowAllOutbound: true,
    });

    if(this._context?.CIDRS?.dbreport1) {
      this._securityGroup.addIngressRule(Peer.ipv4(this._context.CIDRS.dbreport1), Port.tcp(this._port));
    }
    if(this._context?.CIDRS?.dbreport2) {
      this._securityGroup.addIngressRule(Peer.ipv4(this._context.CIDRS.dbreport2), Port.tcp(this._port));
    }


    switch(dbType) {

      case WORDPRESS_DB_TYPE.INSTANCE:
        const di: DatabaseInstance = new DatabaseInstance(this, `${id}-mysql-instance`, {
          vpc: this.vpc,
          vpcSubnets: { subnetType: SubnetType.PUBLIC },
          engine: DatabaseInstanceEngine.mysql({
            version: MysqlEngineVersion.VER_5_7
          }),
          // enablePerformanceInsights: true,
          copyTagsToSnapshot: true,
          databaseName: this._context.WORDPRESS.env.dbName,
          credentials,
          instanceType: InstanceType.of( InstanceClass.T3, InstanceSize.SMALL ),
          securityGroups: [ this._securityGroup ],
          publiclyAccessible: true,
          removalPolicy: RemovalPolicy.DESTROY,
        }); 
        this._rdsSocketAddress = di.instanceEndpoint.socketAddress;   
        break;

      case WORDPRESS_DB_TYPE.CLUSTER: 
        const dc: DatabaseCluster = new DatabaseCluster(this, `${id}-mysql-cluster`, {
          vpc: this.vpc,
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
          defaultDatabaseName: this._context.WORDPRESS.env.dbName,
          credentials,
          securityGroups: [ this._securityGroup ],
          removalPolicy: RemovalPolicy.DESTROY,
        });
        // var cfnDBCluster = dc.node.defaultChild as CfnDBCluster;
        // cfnDBCluster.addPropertyOverride('PubliclyAccessible', true);
        this._rdsSocketAddress = dc.clusterEndpoint.socketAddress;
        break;

      case WORDPRESS_DB_TYPE.SERVERLESS:
        const sc: ServerlessCluster = new ServerlessCluster(this, `${id}-mysql-cluster`, {
          vpc: this.vpc,
          vpcSubnets: { subnetType: SubnetType.PUBLIC },
          //aws rds describe-orderable-db-instance-options --engine aurora-mysql --db-instance-class db.serverless --region us-east-2
          engine: DatabaseClusterEngine.auroraMysql({
            version: AuroraMysqlEngineVersion.VER_3_04_0,
          }),
          copyTagsToSnapshot: true,
          defaultDatabaseName: this._context.WORDPRESS.env.dbName,
          backupRetention: Duration.days(7),
          credentials,
          securityGroups: [ this._securityGroup ],
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

        this._rdsSocketAddress = sc.clusterEndpoint.socketAddress;
        break;
    }

    // Add a CNAME to the hosted zone indicated in the context record in order to enable dns routing to the db instance/cluster.
    if(hostedZone && addRecordToHostedZone) {
      this._dnsRecordAddress = `${this._context.TAGS.Landscape}.db.${hostedZone}`;
      new CnameRecord(this, `${id}-mysql-cname`, {
        domainName: this._rdsSocketAddress,
        zone: HostedZone.fromLookup(this, `${id}-mysql-hostedzone`, { domainName: hostedZone }),
        recordName: this._dnsRecordAddress,
        ttl: Duration.seconds(300)
     });
    }
  }

  /**
   * Get the endpoint address for use in establishing database connections.
   */
  public get endpointAddress(): string { 
    return this._dnsRecordAddress || this._rdsSocketAddress;
  }

  /**
   * Add an ingress rule to the rds security group to allow ingress from other resources/cidrs.
   * @param sg The security group whose members are being granted ingress through the rds instance/service security group.
   */
  public addSecurityGroupIngressTo(securityGroupId: string): void {
    this._securityGroup.addIngressRule(Peer.securityGroupId(securityGroupId), Port.tcp(this._port));
  }

  /**
   * Get the vpc by checking for it in the properties supplied to the construct, else look it up using the
   * VPC_ID context value, resorting to creating a new vpc if either return no vpc.
   */
  public get vpc(): Vpc {
    if(this._vpc) {
      return this._vpc;
    }
    let { vpc } = this._props || { };
    if( ! vpc) {
      if(this._context.VPC_ID) {
        vpc = Vpc.fromLookup(this, 'BuVpc', { vpcId: this._context.VPC_ID })
      }
    }
    if( ! vpc) {
      vpc = new Vpc(this, `${this._id}-vpc`, {
        ipAddresses: IpAddresses.cidr('10.0.0.0/21')
      });
    }
    this._vpc = vpc;
    return vpc;
  }
}