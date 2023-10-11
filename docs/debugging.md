# Debugging & troubleshooting

Here are some topics that come under the heading of debugging and troubleshooting.
If deploying the stack is bugged/incomplete, or the infrastructrue/application is blocked or not performing as expected, here are some of the options available for investigation and debugging:

- **Stepping through the cdk typescript code.**
  The following assumes you are using [vscode](https://code.visualstudio.com/download).
  Use the following configuration in `.vscode/launch.json` to run the same code as would the [synth](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-synth) command:

  ```
  {
    "configurations": [
      {
        "type": "node",
        "request": "launch",
        "name": "(CDK) wp-to-cloud",
        "skipFiles": [
          "<node_internals>/**"
        ],
        "runtimeArgs": [
          "-r", "./node_modules/ts-node/register/transpile-only"
        ],
        "args": [
          "${workspaceFolder}/bin/bu-wordpress-ecs.ts"
        ], 
        "envFile": "${workspaceFolder}/.env"
      },
  
  ```

  Place a breakpoint anywhere in code that should run, select the new configuration in the `"RUN AND DEBUG"` picklist, and click `F5`

**Shell into a fargate container.**
The detailed explanation of this feature is documented [here](https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/) and [here](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html), but in short:
Ensure the [enableExecuteCommand](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#enableexecutecommand) in the [[ApplicationLoadBalancedFargateService construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html) is set to true.
This will add the following policy actions to the [task role](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs.FargateTaskDefinition.html#taskrole)

```
"ssmmessages:CreateControlChannel",
"ssmmessages:CreateDataChannel",
"ssmmessages:OpenControlChannel",
"ssmmessages:OpenDataChannel"
```

Fargate containers are already instrumented with the [SSM core agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent-technical-details.html), and these policies allow it to work with [*ECS E*xec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html).
Open a [cloudshell session](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html) 
or... 
from your own console if you have the aws cli installed
and...
enter the following command *(enter the appropriate values for the bracketed placeholders)*.

```
aws ecs execute-command  \
    --region [AWS_REGION] \
    --cluster [CLUSTER_NAME] \
    --task [TASK_ID] \
    --container wordpress \
    --command "/bin/bash" \
    --interactive
```

