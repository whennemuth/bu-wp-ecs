import { Stack } from "aws-cdk-lib";
import { WordpressEcsConstruct } from "../Wordpress";
import { IamCertificate } from "../Certificate";
import { ApplicationLoadBalancer, ApplicationProtocol, ListenerAction, TargetGroupLoadBalancingAlgorithmType } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { WordpressAppContainerDefConfig } from "../WordpressAppContainerDefConfig";
import { ListenerConfig } from "aws-cdk-lib/aws-ecs";


/**
 * There is no route53 hosted zone, so the alb for the fargate service construct must be created
 * BEFORE the https listener and target group are create for it. This is because the automatically
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
    // Create an iam server certificate
    const iamCert = new IamCertificate(this, `${this.id}-selfsign-cert`, { yearsToExpire: 5 });
    this.fargateService.loadBalancer.node.addDependency(iamCert);
  
    // Create an https listener for the alb
    const listener = this.fargateService.loadBalancer.addListener(`${this.id}-https-listener`, {
      certificates: [ { certificateArn: iamCert.getIamCertArn() } ],
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: `404 Error: ${this.context.TAGS.Landscape} Page not found`
      }),
      protocol: ApplicationProtocol.HTTPS,
    });

    // Associate the listener with a new target group for the wordpress container, and register the listener with the alb.
    this.fargateService.service.registerLoadBalancerTargets({
      containerName: `${this.containerDefProps.containerName}`,
      containerPort: WordpressAppContainerDefConfig.CONTAINER_PORT,
      newTargetGroupId: `${this.id}-https-tg`,
      listener: ListenerConfig.applicationListener(listener, {
        protocol: ApplicationProtocol.HTTPS,
        targetGroupName: `${this.id}-https-tg`,
        healthCheck: {
          enabled: true,
          healthyThresholdCount: 3,
          healthyHttpCodes: '200-499',
        },
        loadBalancingAlgorithmType: TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,          
      })
    });    
  }
}