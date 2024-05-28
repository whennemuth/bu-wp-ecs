import { Duration, Stack } from 'aws-cdk-lib';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { ContainerDefinitionOptions, FargateTaskDefinitionProps, ScalableTaskCount } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService as albfs, ApplicationLoadBalancedFargateServiceProps as albfsp } from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';

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
    return this.context?.DNS?.certificateARN ? true : false;
  }

  public setTaskAutoScaling = (): void => {
    const stc: ScalableTaskCount = this.fargateService.service.autoScaleTaskCount({
      // The lower boundary to which service auto scaling can adjust the desired count of the service.
      minCapacity: 2,
      // The upper boundary to which service auto scaling can adjust the desired count of the service.
      maxCapacity: 10
    });

    // Target Tracking
    stc.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.minutes(1),
      scaleOutCooldown: Duration.minutes(1),      
    });

    stc.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.minutes(1),
      scaleOutCooldown: Duration.minutes(1),      
    });

    /**
     * Scheduled adjustment to the minimum number of tasks required.
     * This will effectively neutralize any target tracking scaling that attempts to reduce the task count
     * down to 1 task by maintaining a lower limit of 2.  
     */
    stc.scaleOnSchedule('WorkDayMorningScaleUp', {
      schedule: Schedule.cron({ hour: '8', minute: '0', weekDay: '1-5' }),
      minCapacity: 2
    });
    /**
     * Scheduled adjustment to the minimum number of tasks required.
     * This will effectively enable any target tracking scaling that wants to reduce the task count
     * down to 1 task.  
     */
    stc.scaleOnSchedule('WorkDayEveningScaleDown', {
      schedule: Schedule.cron({ hour: '20', minute: '0', weekDay: '1-5' }),
      minCapacity: 1
    });  
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
