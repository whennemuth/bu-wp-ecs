import { Stack } from "aws-cdk-lib";
import { WordpressEcsConstruct } from "../Wordpress";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";

/**
 * A prexisting cloudfront distribution will be configured to "point" at the ALB created by this
 * stack as one of its origins. Thus it is unnecessary for the ALB to be public facing as all 
 * requests will use the distribution domain name and go through cloudfront.
 */
export class CloudfrontWordpressEcsConstruct extends WordpressEcsConstruct {
  
  constructor(baseline: Stack, id: string, props?: any) {
    super(baseline, id, props);
  }

  adaptResourceProperties(): void {
    const alb = new ApplicationLoadBalancer(this, `${this.id}-alb`, {
      vpc: this.getVpc(), 
      internetFacing: false,
      loadBalancerName: `${this.id}-alb-${this.context.TAGS.Landscape}`
    }); 

    Object.assign(this.fargateServiceProps, { 
      publicLoadBalancer: false,
      loadBalancerName: undefined,
      loadBalancer: alb,
    });
  }

  adaptResources(): void {
    /* Do nothing */
  }
}