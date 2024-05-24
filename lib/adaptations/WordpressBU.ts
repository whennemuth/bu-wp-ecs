import { Stack, Duration } from 'aws-cdk-lib';
import { WordpressEcsConstruct } from '../Wordpress';
import { Vpc, Subnet, SecurityGroup, Peer, Port, SubnetSelection }  from "aws-cdk-lib/aws-ec2";
import { Cluster, ScalableTaskCount} from 'aws-cdk-lib/aws-ecs';
import { WordpressAppContainerDefConfig as containerDefConfig } from '../WordpressAppContainerDefConfig';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling'
import { AdaptableConstruct } from '../AdaptableFargateService';
import { IContext, Subnets } from '../../contexts/IContext';

/**
 * This is the BU adaptation to the standard wordpress construct. All mutation of that baseline 
 * service to accomodate BU peculiarities are done here.
 */
export class BuWordpressEcsConstruct extends WordpressEcsConstruct {

  private adaptations: Adaptations;

  constructor(baseline: Stack, id: string, props?: any) {
    super(baseline, id, props);
    this.adaptations = new Adaptations(this);
  }

  adaptResourceProperties(): void {
    Object.assign(
      this.fargateServiceProps,
      {
        vpc: this.getVpc(),
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


/**
 * Export the adaptations themselves - makes it possible to reuse or decorate them elsewhere.
 */
export class Adaptations {
  private construct:AdaptableConstruct;
  private vpc:Vpc;
  private subnets:Subnets = {} as Subnets;
  private context:IContext;

  constructor(construct:AdaptableConstruct) {
    this.construct = construct;
    const context = (this.construct as AdaptableConstruct).context;
    this.subnets = context?.SUBNETS || {} as Subnets ;
  }

  public getCluster(): Cluster {
    return new Cluster(this.construct, `${this.construct.id}-cluster`, { 
      vpc: this.construct.getVpc(),
      containerInsights: true,
      clusterName: `${this.construct.id}-cluster`,
    });
  }

  public getSubnetSelection(): SubnetSelection {
    const self: AdaptableConstruct = this.construct;
    const campus1 = this.subnets?.campus1;
    const campus2 = this.subnets?.campus2;
    const subsln = new class subsln implements SubnetSelection {
      subnets = [
        Subnet.fromSubnetId(self, 'subnet1', campus1),
        Subnet.fromSubnetId(self, 'subnet2', campus2)
      ];
    };
    return subsln;
  }

  public getSecurityGroups(): SecurityGroup[] {
    const sg = new SecurityGroup(this.construct, `${this.construct.id}-campus-sg`, {
      vpc: this.construct.getVpc(), 
      allowAllOutbound: true
    });

    // Add subnet ingress rules
    const CIDRS = this.construct.context.CIDRS;
    if (CIDRS) {
      for (const [key, value] of Object.entries(CIDRS)) {
        sg.addIngressRule(Peer.ipv4(<string>value), Port.tcp(containerDefConfig.SSL_HOST_PORT))
        console.log(`${key}: ${value}`);
      }
    }
    return [ sg ];
  }

  public setTaskAutoScaling(): void {
    const stc: ScalableTaskCount = this.construct.fargateService.service.autoScaleTaskCount({
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
}
