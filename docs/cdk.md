# CDK (Cloud Development Kit)

The [CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) is the cloud-forming choice for this project. The CDK is a framework for defining cloud infrastructure in code and provisioning it through AWS CloudFormation. The main benefits of the CDK over direct cloudformation are bulleted on its [home page](https://docs.aws.amazon.com/cdk/v2/guide/home.html). The following is some commentary on what aspects of those features stood out having worked with cloud-formation directly in the past:

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

- Automatically `aws:cdk:path` metadata to each resource that seems to drive a much more organized tree view in the aws management console for cloud formation.