# Wordpress ECS stack

A CDK app that creates and deploys a [Cloudformation][https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html] stack comprising an [ecs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) [cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) for wordpress websites and related services.

## Overview

Currently, this deployment sets up an [ecs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) [cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) for running wordpress websites, requiring two services:

1. **SigV4:**
   This deployment makes assumptions about from where wordpress assets are obtained. The common setup for that would be with wordpress running against apache, which in turn maps requests for assets to locations in the file system of the same host. That approach is modified here such that those assets are stored in S3 and apache no longer retrieves them from its file system, but proxies the asset requests to corresponding locations within an s3 bucket over http. To implement the proper authorization and asset management, requests are routed through [s3 object lambda access points *(olap)*](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-objects.html). In order for apache to proxy requests to olap, it must apply the required signature *[(sigv4)](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)* to them. This suggests the first service for the cluster, one that is based on [aws-sigv4-proxy](https://github.com/awslabs/aws-sigv4-proxy), which apache can proxy requests to and have them signed enroute to the olap.
2. **Wordpress**:
   Beyond this, the other obvious service is one that runs wordpress itself. In mind is something that can grow to be a candidate for hosting [Boston University wordpress websites](https://www.bu.edu/tech/services/cccs/websites/www/wordpress/).

## Prerequisites

- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS CLI](https://aws.amazon.com/cli/)
- [Node & NPM](https://nodejs.org/en/download)
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- Admin role for target BU CSS account *(ie: Shibboleth-InfraMgt/yourself@bu.edu)*

## Steps

1. Create a `./context/_default.json` file.
   This file contains all parameters that the cdk will use when generating the Cloudformation template it later deploys. These parameters correspond to something one might otherwise use as values being supplied straight to Cloudformation if it were being invoked directly, but they appear "hard-coded" in the stack template. [From CDK docs on parameters](https://docs.aws.amazon.com/cdk/v2/guide/parameters.html):

   > *In general, we recommend against using AWS CloudFormation parameters with the AWS CDK. The usual ways to pass values into AWS CDK apps are [context values](https://docs.aws.amazon.com/cdk/v2/guide/context.html) and environment variables. Because they are not available at synthesis time, parameter values cannot be easily used for flow control and other purposes in your CDK app.*

   Currently, there are two scenarios for two types of stacks, each with their own set of parameters.
   The following are links for details of each scenario with explanations of the parameters. 
   
   - [EC2 on ECS Stack](./README-parms-ec2.md)
   - [Fargate Stack](README-parms-fargate.md)
   
2. [OPTIONAL] Run the CDK command to generate the cloudformation template that will be used to create the stack:

   ```
   cdk synth --profile infnprd &> cdk.out/S3ProxyEcsStack.template.yaml
   ```

   *NOTE: The synth command will create a .json file, but will also output yaml to stdout. The command above redirects that output to a yaml file alongside the json file.*

3. Run the CDK command to create the stack:

   ```
   cdk deploy --profile infnprd --no-rollback
   ```

   

## Notes

[Autoscaling](./README-autoscaling.md)

*Commands scratchpad (work into documentation properly later)*:

```
MSYS_NO_PATHCONV=1 && \
docker run --rm -ti \
  -e 'AWS_ACCESS_KEY_ID=[key]' \
  -e 'AWS_SECRET_ACCESS_KEY=[secret]' \
  -e 'healthcheck_path=/files/_healthcheck_' \
  -p 8080:8080 \
  aws-sigv4-proxy -v --name s3-object-lambda --region us-east-1 --no-verify-ssl
```

*Another scratchpad for knick-knacks:*

- `""resolveJsonModule": true"` is added to compilerOptions in tsconfig.json.
  This allows for importing json configuration files into modules as if they were javascript.
  For example:

  ```
  import * as contextFile from '../context.json';
  ```

- CDK benefits over direct cloudformation:

  - As per [AWS docs on construct types](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html#constructs_lib), using an "L3" level construct or "pattern", the CDK does almost everything for you.
    However, even if one uses "L2" constructs, a great deal of direct cloudformation effort is removed: 

    > *...incorporate the defaults, boilerplate, and glue logic you'd be writing yourself with a CFN Resource construct. AWS constructs offer convenient defaults and reduce the need to know all the details about the AWS resources they represent. They also provide convenience methods that make it simpler to work with the resource.*

    For this project, some of the most valuable time savers are the implicit & automatic creation of

    - IAM roles
    - Autoscaling lifecycle hooks
    - Security groups

  - Adds "dependsOn" attributes automatically to properly control the order in which resources are created.

  - Automatically uploads generated templates to an automatically generated s3 bucket for cloudformation to target.

  - Automatically empties buckets so they can be removed without error during a stack deletion.

