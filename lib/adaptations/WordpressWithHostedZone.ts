import { Stack } from "aws-cdk-lib";
import { Certificate, ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { ApplicationLoadBalancedFargateServiceProps, ApplicationLoadBalancedServiceRecordType } from "aws-cdk-lib/aws-ecs-patterns";
import { ARecord, HostedZone, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudfrontWordpressEcsConstruct } from "./WordpressBehindCloudfront";
import { WordpressEcsConstruct } from "../Wordpress";

/**
 * This construct applies an A record for a subdomain to an existing hosted zone targeting an
 * existing CloudFront distribution.
 */
export class HostedZoneForCloudfrontWordpressEcsConstruct extends CloudfrontWordpressEcsConstruct {
  
  constructor(private params: {
    baseline: Stack, 
    id: string, 
    distributionDomainName?: string,
    ignoreRoute53?: boolean,
    props?: any 
  }) {
    super(params.baseline, params.id, { 
      distributionDomainName: params.distributionDomainName, ignoreRoute53: params.ignoreRoute53,
      ...params.props });
  }

  /**
   * Enforce a singleton pattern for the hosted zone construct so as to avoid name collisions
   * @returns 
   */
  private getDomainZone(): IHostedZone {
    const { domainZone } = this.props;
    if(domainZone) return domainZone;
    const { context: { DNS: { hostedZone:domainName = '' } = {} } } = this;
    this.props.domainZone = HostedZone.fromLookup(this, 'Zone', { domainName }) satisfies IHostedZone;
    return this.props.domainZone;
  }

  adaptResourceProperties(): void {

    // bind getDomainZone to this
    this.getDomainZone = this.getDomainZone.bind(this);

    super.adaptResourceProperties();

    // Unpack needed values
    const { 
      id, getDomainZone, context: { 
        DNS: { certificateARN:certArn = '' } = {}, 
        STACK_ID, TAGS: { Landscape } 
      } 
    } = this;

    // Cannot proceed without a certificate
    if( ! certArn) throw new Error('You must include a ssl certificate if involving cloudfront with hosted zone');

    // Look up the hosted zone and certificate
    const domainZone = getDomainZone();
    const certificate = Certificate.fromCertificateArn(this, `${id}-acm-cert`, certArn) satisfies ICertificate;

    Object.assign(this.fargateServiceProps, { 
      certificate, 
      domainName: `${STACK_ID}.${Landscape}.${domainZone}`, 
      domainZone, 
      redirectHTTP: true,
      // Prevent adding an A record to the hosted zone for the ALB.
      recordType: ApplicationLoadBalancedServiceRecordType.NONE,
      publicLoadBalancer: true,
      loadBalancer: this.alb,
    } as ApplicationLoadBalancedFargateServiceProps);
  }

  adaptResources(): void {

    super.adaptResources();

    // Unpack/destructure needed values
    const { id, getDomainZone, props: { ignoreRoute53=false }, context: { DNS: { 
      hostedZone, subdomain, cloudfront: { distributionDomainName = '' } = {} 
    } = {} } } = this;

    // Cannot proceed without a hosted zone
    if( ! hostedZone) throw new Error('A hosted zone is required if involving cloudfront with hosted zone!');

    // Warn if subdomain is not provided
    if( ! subdomain) console.warn('A subdomain was not provided; using root domain for hosted zone.');

    // Look up the hosted zone
    const domainZone: IHostedZone = getDomainZone();

    // Abort the rest if instructed to ignore route53
    if(ignoreRoute53) {
      console.log(`Ignoring route53 record creation for subdomain ${subdomain} in hosted zone ${hostedZone}`);
      return;
    }

    // Create the A record that points directly to the CloudFront distribution domain
    new ARecord(this, `${id}-cloudfront-alias-record`, {
      zone: domainZone,
      recordName: subdomain,
      target: RecordTarget.fromAlias({
        bind: () => ({
          dnsName: distributionDomainName,
          hostedZoneId: 'Z2FDTNDATAQYW2' // Standard global CloudFront hosted zone ID
        })
      }),
      comment: `ALIAS record for ${subdomain} pointing to CloudFront distribution ${distributionDomainName}`
    });
  }
}

/**
 * This construct applies an A record for a subdomain to an existing hosted zone targeting the auto-created
 * ALB created by the underlying fargate construct.
 */
export class HostedZoneForALBWordpressEcsConstruct extends WordpressEcsConstruct {

  adaptResourceProperties(): void {

    // Unpack needed values
    const { id, context: { DNS: { certificateARN:certArn = '', hostedZone:domainName = '' } = {} } } = this;

    // Look up the hosted zone and certificate
    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName }) satisfies IHostedZone;
    const certificate = Certificate.fromCertificateArn(this, `${id}-acm-cert`, certArn) satisfies ICertificate;

    Object.assign(this.fargateServiceProps, { 
      certificate, 
      domainName, 
      domainZone,
      // TODO: Not sure if redirectHTTP will negate health checks that are made over http (not https).
      // However, as long as the shibboleth.conf file for apache exempts the health check path, health checks over https should be ok.
      redirectHTTP: true,
      recordType: ApplicationLoadBalancedServiceRecordType.ALIAS
    });

  }

  adaptResources(): void { /** Do nothing */ }
}