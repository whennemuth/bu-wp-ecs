import { DescribeManagedPrefixListsCommand, DescribeManagedPrefixListsRequest, DescribeManagedPrefixListsResult, EC2Client } from "@aws-sdk/client-ec2";
import { GetSecretValueCommand, GetSecretValueCommandOutput, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Stack } from "aws-cdk-lib";
import { Certificate, ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import { CfnSecurityGroup, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { ApplicationLoadBalancedFargateServiceProps, ApplicationLoadBalancedServiceRecordType } from "aws-cdk-lib/aws-ecs-patterns";
import { ApplicationListener, ApplicationLoadBalancer, ApplicationLoadBalancerProps, CfnListener, ListenerAction, ListenerCondition } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { HostedZone, IHostedZone } from "aws-cdk-lib/aws-route53";
import { ParameterTester } from "../Utils";
import { WordpressEcsConstruct } from "../Wordpress";
import { WordpressAppContainerDefConfig } from "../WordpressAppContainerDefConfig";

/**
 * A prexisting cloudfront distribution will be configured to "point" at the ALB created by this
 * stack as one of its origins. Thus, it would be unnecessary for the ALB to be public facing as all 
 * requests will use the distribution domain name and go through cloudfront (Requires wordpress 
 * fargate container to NOT redirect http to https).
 */
export class CloudfrontWordpressEcsConstruct extends WordpressEcsConstruct {
  
  constructor(baseline: Stack, id: string, props?: any) {
    super(baseline, id, props);
  }

  adaptResourceProperties(): void {

    const {  id, vpc, props, context: { STACK_ID, DNS, TAGS: { Landscape } } } = this;

    // 1) Unpack the DNS.
    const { hostedZone, subdomain, certificateARN, cloudfront } = DNS || {};
    if( ! hostedZone) throw new Error('A hosted zone is required if using cloudfront!');
    if( ! subdomain) throw new Error('A subdomain is required if using cloudfront!');
    if( ! certificateARN) throw new Error('You must include a ssl certificate using cloudfront');

    // 2) Create the one security group for the ALB, which should only allow inbound requests from cloudfront
    const { SSL_HOST_PORT:httpsPort } = WordpressAppContainerDefConfig;
    const securityGroup = new SecurityGroup(this, `${id}-alb-sg`, {
      vpc, 
      allowAllOutbound: true, 
      description: `Allow ingress from cloudfront on port ${httpsPort}`,
    });
    const prefixListId = props['cloudfront-prefix-id'];

    securityGroup.addIngressRule(Peer.prefixList(prefixListId), Port.tcp(httpsPort));

    // 3) Create the ALB. It must be public because cloudfront cannot reach it otherwise.
    // However, you can still lock down ingress to cloudfront only via the security group.
    // Also, consider: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html
    const alb = new ApplicationLoadBalancer(this, `${id}-alb`, {
      vpc, 
      internetFacing: true,
      loadBalancerName: `${id}-alb-${Landscape}`,      
      securityGroup
    } as ApplicationLoadBalancerProps);

    // 4) Have to create an escape hatch here because the cdk always adds a default inline ingress rule to the sg
    // We do not want this ingress rule - we only want the cloudfront ingress rule, so removing it here.
    const sg = securityGroup.node.defaultChild as CfnSecurityGroup;
    sg.addPropertyDeletionOverride('SecurityGroupIngress');
    
    // 5) Apply https settings to the ALB.
    const certificate:ICertificate = Certificate.fromCertificateArn(this, `${id}-acm-cert`, certificateARN);
    const domainZone:IHostedZone = HostedZone.fromLookup(this, 'Zone', { domainName: hostedZone });
    Object.assign(this.fargateServiceProps, { 
      certificate, 
      domainName: `${STACK_ID}.${Landscape}.${hostedZone}`, 
      domainZone, 
      redirectHTTP: true,
      recordType: ApplicationLoadBalancedServiceRecordType.NONE, // Keeps from adding an A record to the hosted zone
      publicLoadBalancer: true,
      loadBalancer: alb,
    } as ApplicationLoadBalancedFargateServiceProps);
  }

  adaptResources(): void {
    const { loadBalancer: { listeners }, targetGroup } = this.fargateService
    const { isBlank } = ParameterTester;
    const { challengeHeaderName } = this.context?.DNS?.cloudfront!;
    const challengeHeaderValue = this.props['cloudfront-challenge'];
    if(isBlank(challengeHeaderName)) {
      throw new Error('The alb challenge header name has not been set in context.json');
    }
    if(isBlank(challengeHeaderValue)) {
      throw new Error('The alb challenge header value was not provided (Did the lookup fail?)');
    }
    
    // Find the https listener.
    const httpsListener = listeners.find((listener:ApplicationListener) => {
      return `${listener['protocol']}`.toLowerCase() == 'https';
    }) || {} as ApplicationListener;
    
    // Apply a rule to the listener making it only forward traffic if the expected cloudfront challenge 
    // header is present and has the expected value.
    httpsListener.addAction(`${this.id}-listener-action`, {
      action: ListenerAction.forward([ targetGroup ]),
      conditions: [ ListenerCondition.httpHeader(challengeHeaderName, [ challengeHeaderValue ]) ],
      priority: 1
    });

    // Disable the default listener rule so that the new "challenge" rule is the only rule that
    // applies for the listener. This requires an escape hatch.
    const defaultListener = httpsListener.node.defaultChild as CfnListener;
    defaultListener.addPropertyOverride('DefaultActions.0.Type', 'fixed-response');
    defaultListener.addPropertyDeletionOverride('DefaultActions.0.TargetGroupArn');
    const fixedResponseConfig = {
      ContentType: 'text/html',
      MessageBody: 'Access denied',
      StatusCode: '403'
    };
    defaultListener.addPropertyOverride('DefaultActions.0.FixedResponseConfig', fixedResponseConfig);

    this.setTaskAutoScaling();
  }
}


/**
 * Use the sdk to lookup the id for the cloudfront prefix list.
 * @returns 
 */
export async function lookupCloudfrontPrefixListId(region:string): Promise<string|undefined> {
  console.log('Looking up prefix list ID for cloudfront...');
  const client = new EC2Client({ region });
  const command = new DescribeManagedPrefixListsCommand({
    Filters: [
      { Name: 'prefix-list-name', Values: ['com.amazonaws.global.cloudfront.origin-facing'] }
    ]
  } as DescribeManagedPrefixListsRequest);  
  const response = await client.send(command) as DescribeManagedPrefixListsResult;
  return response?.PrefixLists![0].PrefixListId;
}

/**
 * Lookup the cloudfront header challenge value in secrets manager.
 * @param secretArn 
 * @param secretFld 
 * @returns 
 */
export const lookupCloudfrontHeaderChallenge = async (secretArn:string, secretFld:string) => {
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const region = secretArn.split(':')[3];
  const secretsClient = new SecretsManagerClient({ region });
  const response:GetSecretValueCommandOutput = await secretsClient.send(command);
  if( ! response.SecretString) {
    throw new Error('Empty/missing cloudfront header challenge!');
  }
  const fieldset = JSON.parse(response.SecretString);
  const challenge = fieldset[secretFld];
  return challenge;
}

