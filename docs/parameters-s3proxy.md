# Standard standalone s3proxy service (example)

Parameters to deploy a standalone s3 proxy signing service *(no wordpress, database, etc)*:

`./contexts/context.json`:

```
{
  "SCENARIO": "s3proxy",
  "STACK_ID": "s3proxy",
  "STACK_NAME": "wordpress-s3proxy-fargate-service",
  "STACK_DESCRIPTION": "Standalone sigv4 signing service for proxying wordpress asset retrieval to s3.",
  "PREFIXES": {
    "wordpress": "jaydubbulb",
    "s3proxy": "sigv4",
    "rds": "rds"
  },
  "ACCOUNT": "037860335094",
  "REGION": "us-east-2",
  "S3PROXY": {
    "dockerImage": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
    "bucketUserSecretName": "wordpress-protected-s3-assets-dev-user/AccessKey",
    "OLAP": "wordpress-protected-s3-assets-dev-olap"
  },
  "TAGS": {
    "Service": "websites",
    "Function": "wordpress",
    "Landscape": "devl"
  }
}
```

This will deploy a [ApplicationLoadBalancedFargateService CDK Construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html), resulting in a fargate cluster with one task running.
Provided the following are true:

- The [ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html) created has a DNS name of `s3proxy-alb-1028790297.us-east-2.elb.amazonaws.com`

- A [bu-protected-s3-object-lambda](https://github.com/bu-ist/bu-protected-s3-object-lambda/tree/main) stack pre-exists in the same aws account, has a secret and object lambda access endpoint that match the "`bucketUserSecretName`" and "`OLAP`" parameters respectively, and had an asset uploaded as follows:

  ```
  aws --profile=bu s3 cp cuba-abroad-banner-compressed.jpg s3://wordpress-protected-s3-assets-dev-assets/original_media/jaydub-bulb.cms-devl.bu.edu/admissions/files/2018/09/
  ```

...then, you should be able to see the `cuba-abroad-banner-compressed.jpg` image in your browser at the following url:

```
http://s3proxy-alb-1028790297.us-east-2.elb.amazonaws.com/jaydub-bulb.cms-devl.bu.edu/admissions/files/2018/09/cuba-abroad-banner-compressed.jpg
```

