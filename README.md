# Wordpress ECS stack

A CDK app that creates and deploys a [Cloudformation][https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html] stack comprising an [ecs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) [cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) for wordpress websites and related services.

### Overview

Currently, this deployment sets up an [ecs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) [cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) for running wordpress websites, of one [ecs service](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_services.html). The ecs service runs a task that comprises two [container definitions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#container_definitions).

1. **Wordpress**:
   The obvious container is one that hosts wordpress itself. In mind is something that can grow to be a candidate for hosting [Boston University wordpress websites](https://www.bu.edu/tech/services/cccs/websites/www/wordpress/).
1. **SigV4:**
   This deployment makes assumptions about from where wordpress assets are obtained. The common setup for that would be with wordpress running against apache, which in turn maps requests for assets to locations in the file system of the same host. That approach is modified here such that those assets are stored in S3 and apache no longer retrieves them from its file system, but proxies the asset requests to corresponding locations within an s3 bucket over http. To implement the proper authorization and asset management, requests are routed through [s3 object lambda access points *(olap)*](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-objects.html). In order for apache to proxy requests to olap, it must apply the required signature *[(sigv4)](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)* to them. This suggests a second container, one that is based on [aws-sigv4-proxy](https://github.com/awslabs/aws-sigv4-proxy) and can run as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html) to the wordpress container, and to which the apache service can proxy requests to and have them signed enroute to the olap.

TODO: Include architectural explanation and diagram here.

### Prerequisites

- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS CLI](https://aws.amazon.com/cli/)
- [Node & NPM](https://nodejs.org/en/download)
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- Admin role for target account *(ie: Shibboleth-InfraMgt/yourself@bu.edu, for the BU CSS account)*

### Steps

1. Create a `./context/context.json` file. *([`./context/_example-context.json`](./context/_example-context.json) is a useful file to base yours on)*.
   This file will contain all parameters that the cdk will use when generating the Cloudformation template it later deploys. Most of these parameters correspond to something one might otherwise use as values being supplied to Cloudformation if it were being invoked directly, but they will appear "hard-coded" in the stack template. [From CDK docs on parameters](https://docs.aws.amazon.com/cdk/v2/guide/parameters.html):

   > *In general, we recommend against using AWS CloudFormation parameters with the AWS CDK. The usual ways to pass values into AWS CDK apps are [context values](https://docs.aws.amazon.com/cdk/v2/guide/context.html) and environment variables. Because they are not available at synthesis time, parameter values cannot be easily used for flow control and other purposes in your CDK app.*

   Currently, the recognized scenarios for stack creation will come with their own subset of parameters.
   The following link details each scenario with explanations of the parameters. 
   
   - [Parameters](./docs/parameters.md)
   
2. Obtain [security credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html?icmpid=docs_homepage_genref) for the admin-level [IAM role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) you will be using for accessing the aws account to lookup and/or deploy resources.
   Create a [named profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-using-profiles) out of these credentials in your [`~/.aws/credentials`](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-where) file.
   
2. [OPTIONAL] Run the [CDK synth command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-synth) command to generate the cloudformation template that will be used to create the stack:

   ```
   cdk synth --profile infnprd &> cdk.out/S3ProxyFargateStack.template.yaml
   ```

   *NOTE: The synth command will create a .json file, but will also output yaml to stdout. The command above redirects that output to a yaml file alongside the json file.*

3. Run the [CDK deploy command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-deploy) to create the stack:

   ```
   cdk deploy --profile infnprd --no-rollback
   ```


### Notes

Some discoveries specific to certain AWS services and related items were found to be of help in development of this project, and are worth noting separately. Also, a more detailed explanation and reasoning behind approaches taken is included. 

- [Stack Parameters](./docs/parameters.md)
- [Fargate](./docs/fargate.md)
- [CDK](./docs/cdk.md)
- [Autoscaling](./docs/autoscaling.md)
