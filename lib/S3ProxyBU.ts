import { Stack } from 'aws-cdk-lib';
import { WordpressS3ProxyEcsConstruct } from './S3Proxy';
import { Adaptations } from './WordpressBU';

/**
 * This is the BU adaptation to the standard wordpress construct. All mutation of that baseline 
 * service to accomodate BU peculiarities are done here.
 * NOTE: This is a standalone reference implementation only - see the superclass for more info.
 * Also, all adaptations are being "borrowed" from the wordpress app fargate service construct.
 */
export class BuWordpressS3ProxyEcsConstruct extends WordpressS3ProxyEcsConstruct {
  
  private adaptations: Adaptations;
  
  constructor(baseline: Stack, id: string) {
    super(baseline, id);
    this.adaptations = new Adaptations(this);
  }
  
  adaptResourceProperties(): void {
    Object.assign(
      this.fargateServiceProps,
      {
        cluster: this.adaptations.getCluster(),
        taskSubnets: this.adaptations.getSubnetSelection(),
        securityGroups: this.adaptations.getSecurityGroups()
      }
    );
  }  

  adaptResources(): void {
    this.adaptations.setTaskAutoScaling();
  } 
}