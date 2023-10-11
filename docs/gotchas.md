# Things to watch out for

The following is collection of hidden or commonly missed features to keep in mind for this project - business requirement peculiarities, CDK specifics, etc.

- CDK context lookup method return values are stored in cache, which may need to be evicted if "pointing" at different resources or accounts.
  Also, it is important to note the following:
  
  > ###### *Important*
  >
  > *Because they're part of your application's state, `cdk.json` and `cdk.context.json` must be committed to source control along with the rest of your app's source code. Otherwise, deployments in other environments (for example, a CI pipeline) might produce inconsistent results.*
  
  Something to keep in mind.
  
- The following may trip you up if a container definintion has more than one port mapping.
  When configuring [container definition port mappings](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.ContainerDefinitionOptions.html#portmappings), the order in which containers are defined - if there is more than one in the task definition - matters when it comes to how the cdk [ApplicationLoadBalancedFargateService construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html) auto-generates the initial alb mappings. When it does this, it does not name a specific port. Instead, it allows the default behavior as documented by [loadbalancer target options: containerport](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.LoadBalancerTargetOptions.html#containerport): 

  > *Type:* `number` *(optional, **default: Container port of the first added port mapping**.)*

  So, if the other port mapping is for port 443, but it is the first listed, you will wind up with the following situation:

  - the port 80 target group would take in requests sent by the port 80 listener as expected
  - but it would target the container over port 443 because that is the first port listed.

  In other words, the applicable snippet from the synthesized cloudformation template would look like this:

  ```
  Type: AWS::ECS::Service
  Properties:
  ...
    LoadBalancers:
      - ContainerName: my-container
        ContainerPort: 443
        TargetGroupArn: Ref: [auto-generated-target-group-ref]
      - ContainerName: wp-jaydubbulb
        ContainerPort: 443
        TargetGroupArn: Ref: [your-custom-added-target-group-ref]
  
  ```

  when it should look like this:

  ```
  Type: AWS::ECS::Service
  Properties:
  ...
    LoadBalancers:
      - ContainerName: my-container
        ContainerPort: 80
        TargetGroupArn: Ref: [auto-generated-target-group-ref]
      - ContainerName: wp-jaydubbulb
        ContainerPort: 443
        TargetGroupArn: Ref: [your-custom-added-target-group-ref]
  ```

  This will result in port 80 traffic being forwarded to the container in the taskdef over port 443, and apache running in that container would complain about getting http traffic over port 443 and not proceeding to its https redirection, or port 80 health check exemption as it is configured to do.