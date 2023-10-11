import { Stack } from "aws-cdk-lib";
import { WordpressEcsConstruct } from "../Wordpress";
import { ApplicationLoadBalancer, ApplicationProtocol, ListenerAction, TargetGroupLoadBalancingAlgorithmType } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { WordpressAppContainerDefConfig } from "../WordpressAppContainerDefConfig";


/**
 * There is no route53 hosted zone, so the alb for the fargate service construct must be created
 * BEFORE the https listener and target group are created for it. This is because the automatically
 * generated host name of the alb is needed by the wordpress container definition before it can be
 * created and configured for that target group.
 */
export class SelfSignedWordpressEcsConstruct extends WordpressEcsConstruct {

  constructor(baseline: Stack, id: string, props?: any) {
    super(baseline, id, props);
  }

  /**
   * Create the alb as public facing
   */
  adaptResourceProperties(): void {
    const alb = new ApplicationLoadBalancer(this, `${this.id}-alb`, {
      vpc: this.getVpc(), 
      internetFacing: true,
      loadBalancerName: `${this.id}-alb-${this.context.TAGS.Landscape}`
    }); 

    Object.assign(this.fargateServiceProps, { 
      publicLoadBalancer: true,
      loadBalancerName: undefined,
      loadBalancer: alb,
   });

    // The apache service running in the wordpress container needs to have a virtual host server name 
    // that matches the alb public address
    if(this.containerDefProps?.environment) {
      Object.assign(this.containerDefProps.environment, { SERVER_NAME: alb.loadBalancerDnsName });
    }
  }

  /**
   * Create an iam server certificate, https listener, and target group for secure traffic.
   */
  adaptResources(): void {
  
    // Create an https listener for the alb
    const listener443 = this.fargateService.loadBalancer.addListener(`${this.id}-https-listener`, {
      certificates: [ { certificateArn: this.props.iamServerCertArn } ],
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: `404 Error: ${this.context.TAGS.Landscape} Page not found`
      }),
      protocol: ApplicationProtocol.HTTPS,
    });

    // Associate the listener with a new target group for the wordpress container, and register the listener with the alb.
    listener443.addTargets(`${this.id}-https-tg`, {
      protocol: ApplicationProtocol.HTTPS,
      targetGroupName: `${this.id}-https-tg`,
      targets: [
        this.fargateService.service.loadBalancerTarget({
          containerName: `${this.containerDefProps.containerName}`,
          containerPort: WordpressAppContainerDefConfig.CONTAINER_PORT,
        })
      ],
      healthCheck: {
        path: this.healthcheck,
        healthyThresholdCount: 3,
        healthyHttpCodes: '200-299',
      },
      loadBalancingAlgorithmType: TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
    });

    // ALTERNATIVE METHOD FOR HTTPS TARGET: 
    // this.fargateService.service.registerLoadBalancerTargets({
    //   containerName: `${this.containerDefProps.containerName}`,
    //   containerPort: WordpressAppContainerDefConfig.CONTAINER_PORT,
    //   newTargetGroupId: `${this.id}-https-tg`,
    //   listener: ListenerConfig.applicationListener(listener443, {
    //     protocol: ApplicationProtocol.HTTPS,
    //     targetGroupName: `${this.id}-https-tg`,
    //     healthCheck: {
    //       enabled: true,
    //       healthyThresholdCount: 3,
    //       healthyHttpCodes: '200-499',
    //     },
    //     loadBalancingAlgorithmType: TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,          
    //   })
    // });    
  }
}