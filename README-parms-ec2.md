# CDK context parameters for EC2 on ECS stack

An example `./context/_default.json` looks like this:

```
{
  "SCENARIO": "ec2",
  "ACCOUNT": "770203350335",
  "REGION": "us-east-1",
  "VPC_ID": "vpc-0290de1785982a52f",
  "CAMPUS_SUBNET1": "subnet-06edbf07b7e07d73c",
  "CAMPUS_SUBNET2": "subnet-0032f03a478ee868b",
  "DOCKER_IMAGE_SIGV4": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
  "BUCKET_USER_SECRET_NAME": "wordpress-protected-s3-assets-jaydub-user/AccessKey",
  "OLAP": "wordpress-protected-s3-assets-jaydub-olap",
  "HOSTED_ZONE": "kualitest.research.bu.edu",
  "RECORD_NAME": "s3proxy.kualitest.research.bu.edu",
  "CERTIFICATE_ARN": "arn:aws:acm:us-east-1:770203350335:certificate/117fad49-d620-4bd3-a624-879f3fbd7ab7",
  "TAG_SERVICE": "websites",
  "TAG_FUNCTION": "wordpress",
  "TAG_LANDSCAPE": "devl"
}
```

- SCENARIO: The ecs type: "ec2" or "fargate" *(in this case "ec2")*
- ACCOUNT: The number of the aws account being deployed to.
- REGION: The region being deployed to.
- VPC_ID: The ID of the existing vpc to deploy into in a CSS account
- CAMPUS_SUBNET1: The first of two "campus" subnets to restrict cluster capacity to in a CSS account
- CAMPUS_SUBNET2: The second of two "campus" subnets to restrict cluster capacity to in a CSS account
- DOCKER_IMAGE_SIGV4: The docker tag for the customized s3proxy docker container in a public BU ECR
- BUCKET_USER_SECRET_NAME: The name of a secrets manager secret for the credentials of a prexisting user that has a role sufficient for s3 bucket access needed by the s3proxy task.
- OLAP: The name of the object lambda access point targeted by s3proxy container.
- HOSTED_ZONE: The name of a prexisting hosted zone for which a new "A" record will created to route traffic to the ALB created.
- RECORD_NAME: The name of the record to be added to the hosted zone. This will be the hosted zone root name prefixed with a value for a subdomain.
- CERTIFICATE_ARN: The arn of the prexisting ACM certificate that corresponds to hosted zone being used.
- TAG_SERVICE: Standard tagging requirement for the service the app is part of
- TAG_FUNCTION: Standard tagging requirement for the function the app performs
- TAG_LANDSCAPE: Standard tagging requirement for identifying the environment the deployment serves for.