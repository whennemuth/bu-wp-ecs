# CDK context parameters for fargate stack

An example `./context/_default.json` looks like this:

```
{
  "SCENARIO": "fargate",
  "ACCOUNT": "037860335094",
  "REGION": "us-east-1",
  "DOCKER_IMAGE_SIGV4": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
  "BUCKET_USER_SECRET_NAME": "wordpress-protected-s3-assets-jaydub-user/AccessKey",
  "OLAP": "wordpress-protected-s3-assets-jaydub-olap",
  "TAG_SERVICE": "websites",
  "TAG_FUNCTION": "wordpress",
  "TAG_LANDSCAPE": "devl"
}
```

- SCENARIO: The ecs type: "ec2" or "fargate" *(in this case "fargate")*
- ACCOUNT: The number of the aws account being deployed to.

- REGION: The region being deployed to.
- DOCKER_IMAGE_SIGV4: The docker tag for the customized s3proxy docker container in a public BU ECR
- BUCKET_USER_SECRET_NAME: The name of a secrets manager secret for the credentials of a prexisting user that has a role sufficient for s3 bucket access needed by the s3proxy task.
- OLAP: The name of the object lambda access point targeted by s3proxy container.
- TAG_SERVICE: Standard tagging requirement for the service the app is part of
- TAG_FUNCTION: Standard tagging requirement for the function the app performs
- TAG_LANDSCAPE: Standard tagging requirement for identifying the environment the deployment serves for.