import { Stack } from "aws-cdk-lib";
import { WordpressEcsConstruct } from "../Wordpress";
import { Certificate, ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, IHostedZone } from "aws-cdk-lib/aws-route53";
import { ApplicationLoadBalancedServiceRecordType } from "aws-cdk-lib/aws-ecs-patterns";

export class HostedZoneWordpressEcsConstruct extends WordpressEcsConstruct {

  constructor(baseline: Stack, id: string, props?: any) {
    super(baseline, id, props);
  }

  adaptResourceProperties(): void {
    const certificate:ICertificate = Certificate.fromCertificateArn(
      this, 
      `${this.id}-acm-cert`, 
      this.context.DNS.certificateARN
    );
    const domainName:string = this.context.DNS.hostedZone;
    const domainZone:IHostedZone = HostedZone.fromLookup(this, 'Zone', { domainName });

    // TODO: Haven't tried this out yet - don't know if it will work. Requires a pre-existing acm cert and route53 hosted zone.
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

  adaptResources(): void {
    /** No resources to adapt */
  }
}