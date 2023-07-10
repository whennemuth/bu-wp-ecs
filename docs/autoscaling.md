# Notes on auto-scaling for ECS

There is a good amount of AWS documentation on the subject of auto-scaling.
Reviewing this documentation is recommended to acquire a sufficient base of understanding, know what the different options are, and be able to identify which of these options suit your application the best. This is an attempt fish out of that data what appear to be the more essential points with respect to [Amazon Elastic Container Services (ECS)](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html). Also, since auto-scaling has evolved over time, newer items reside along side older approaches and an attempt is made here to help keep the two from being conflated.

## ECS on EC2

**Before 2020**, one would auto-scale an ECS application by focusing on two separate areas:

1. Scale ec2 infrastructure (capacity) running in their [ecs cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) by stepping out of "ecs land" and work with [ec2 auto-scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html), focusing on the [auto-scaling group](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html). You would [set the capacity limits](https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-capacity-limits.html), *(minimum, maximum, and desired number of instances you wanted running in the cluster)* and then:
   1. Create the [scaling policies](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scale-based-on-demand.html) and 
   2. Combine them with [cloudwatch alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html) to respond to changes in load with scaling actions.
2. [Application auto-scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/services-that-can-integrate-ecs.html). This involves configuring how many tasks *(instances of [task definitions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html))* should be running as a function of the load experienced by the corresponding [service](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_services.html). This involved, among other things:
   1. [Registering a scalable target](https://docs.aws.amazon.com/autoscaling/application/userguide/create-step-scaling-policy-cli.html#step-scaling-register-scalable-target)
   2. [Creating a scaling policy](https://docs.aws.amazon.com/autoscaling/application/userguide/create-step-scaling-policy-cli.html#create-step-scaling-policy)
   3. [Creating an alarm that triggers the scaling policy](https://docs.aws.amazon.com/autoscaling/application/userguide/create-step-scaling-policy-cli.html#step-scaling-create-alarm) *(except if target tracking, in which case the alarm is auto-created)*

**After 2020**, [capacity providers](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-capacity-providers.html) were introduced, simplifying what was outlined above.
For ECS on EC2, [auto-scaling groups](https://docs.aws.amazon.com/autoscaling/ec2/userguide/auto-scaling-groups.html) are involved and so you create an [auto scaling group capacity provider](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/asg-capacity-providers.html) and associate it with your auto-scaling group. Most importantly, you enable managed scaling on the capacity provider, which activates [ECS cluster auto-scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-auto-scaling.html), where ECS manages the infrastructure scaling for you. You no longer need to create any scaling policies or cloudwatch alarms. ECS automatically creates these for you as a combination of [Target Tracking](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking.html), and [Predictive Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-predictive-scaling.html). You must still configure [Application auto-scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/services-that-can-integrate-ecs.html) as detailed above, but that is all, and so you focus on tasks exclusively. For deeper dives:

- [Deep Dive on Amazon ECS Cluster Auto Scaling](https://aws.amazon.com/blogs/containers/deep-dive-on-amazon-ecs-cluster-auto-scaling/)
- [Managing compute for Amazon ECS clusters with capacity providers](https://aws.amazon.com/blogs/containers/deep-dive-on-amazon-ecs-cluster-auto-scaling/)

**Optimization/Packing**



## ECS on Fargate

For [fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html), there is no cluster auto-scaling to think about. This is because fargate is "serverless", though it is worth noting that each task that you run gets its own linux kernel which runs somewhere, meaning that you still use [capacity providers for fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html), though the notion of cluster auto-scaling drops away. So, you focus on tasks alone, which means [Application auto-scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/services-that-can-integrate-ecs.html) only, the same as outlined above for ECS on EC2.