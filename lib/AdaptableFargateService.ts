import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import { ContainerDefinitionOptions, FargateTaskDefinition, FargateTaskDefinitionProps } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService as albfs } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationLoadBalancedFargateServiceProps as albfsp } from 'aws-cdk-lib/aws-ecs-patterns';
import { IContext } from '../contexts/IContext';
import { IpAddresses, Vpc } from 'aws-cdk-lib/aws-ec2';

/**
 * Any fargate service will perform two steps.
 */
export interface FargateService {
  setResourceProperties() : void;
  buildResources() : void;
}

/**
 * All adaptable fargate service constructs will implement the "adapt" methods of this class to add to or 
 * modify the resources being built within. Boilerplate functionality and properties can be added here as well.
 */
export abstract class AdaptableConstruct extends Construct {

  id: string;
  props: any;
  healthcheck: string;
  scope: Construct;
  context: IContext;

  vpc: Vpc;
  containerDefProps: ContainerDefinitionOptions;
  taskDefProps: FargateTaskDefinitionProps;
  fargateServiceProps: albfsp;

  fargateService: albfs;

  /**
   * Most adaptation happens here since property objects are highly mutable.
   */
  abstract adaptResourceProperties(): void;

  /**
   * Some limited adaptation can happen here depending on what construct mutator methods the CDK 
   * API may provide, but most properties are readonly once the resource itself has been instantiated.
   */
  abstract adaptResources(): void;
  
  /**
   * @returns A certificate value indicates ssl.
   */
  useSSL(): boolean {
    return this.context.DNS.certificateARN ? true : false;
  }
  
  /**
   * Get the vpc by checking for it in the properties supplied to the construct, else look it up using the
   * VPC_ID context value, resorting to creating a new vpc if either return no vpc.
   */
  public getVpc(): Vpc {
    if(this.vpc) {
      return this.vpc;
    }
    let { vpc } = this.props || { };
    if( ! vpc) {
      if(this.context.VPC_ID) {
        vpc = Vpc.fromLookup(this, 'BuVpc', { vpcId: this.context.VPC_ID })
      }
    }
    if( ! vpc) {
      vpc = new Vpc(this, `${this.id}-vpc`, {
        ipAddresses: IpAddresses.cidr('10.0.0.0/21')
      });
    }
    this.vpc = vpc;
    return vpc;
  }

  /**
   * Set the tags for the stack
   */
  setStackTags() {
    if( this.scope instanceof Stack) {
      var tags: object = this.context.TAGS;
      for (const [key, value] of Object.entries(tags)) {
        (<Stack> this.scope).tags.setTag(key, value);
      }
    }
  }
};
