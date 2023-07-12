# CDK context parameters

The following are parameters for the CDK deployment. Most of them can be regarded as equivalent to cloud-formation parameters, but others may be used by the CDK code for flow control, where it is possible to branch into alternate patterns and drive [composition](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html#constructs_composition). 

Depending on the scenario that applies, only a subset of the following parameters may be required. The complete listing is below, followed by a breakdown of each scenario and which of these parameters comprise the subset that are relevant to that scenario:

### All Parameters

- SCENARIO: The ecs type: "wordpress-bu" or "s3proxy".
- STACK_ID: Top-level string identifier for the stack that will go into the naming of most created resources.
- PREFIXES: Mid-level string identifier for specific constructs *(wordpress, s3proxy, rds)*
- ACCOUNT: The number of the aws account being deployed to.
- REGION: The region being deployed to.
- VPC_ID: The ID of the existing vpc to deploy into in a CSS account
- CIDRS: An array identifying each ip address range to be set as ingress rules against the security group applied to the fargate service.
- CAMPUS_SUBNET1: The first of two "campus" subnets to restrict cluster capacity to in a CSS account
- CAMPUS_SUBNET2: The second of two "campus" subnets to restrict cluster capacity to in a CSS account
- CAMPUS_VPN_CIDR(1-5): The  values for 5 common campus vpn ranges.
- WP_APP_DV02_CIDR: The IP address of wp-app-dv02 as a CIDR.
- DOCKER_IMAGE_SIGV4: The docker tag for the customized s3proxy docker container in a public docker registry, like the BU ECR
- BUCKET_USER_SECRET_NAME: The name of a secrets manager secret for the credentials of a preexisting user that has a role sufficient for s3 bucket access needed by the s3proxy task.
- WORDPRESS_SECRET_NAME: The name of a secrets manager secret for the WORDPRESS_CONFIG_EXTRA task definition secret. Contains all secrets that wordpress needs, including the database password, that are to be added to the wp-config.php file as documented [here](https://github.com/docker-library/wordpress/pull/142).
- WORDPRESS_SERVER_NAME: The name of the apache virtual host for wordpress. *(See [apache servername directive](https://httpd.apache.org/docs/2.4/mod/core.html#servername))*
- WORDPRESS_SP_ENTITY_ID: The shibboleth SP entity ID as known by the IDP. In shibboleth.xml: `ApplicationDefaults.entityID`
- WORDPRESS_IDP_ENTITY_ID: The shibboleth IDP entity ID. In shibboleth.xml: `ApplicationDefaults.Sessions.SSO.entityID`
- WORDPRESS_TZ: The timezone that the wordpress docker container is to use by way of setting this value as an environment variable.
- OLAP: The name of the object lambda access point targeted by s3proxy container.
- HOSTED_ZONE: The name of a preexisting hosted zone for which a new "A" record will created to route traffic to the ALB created.
- S3PROXY_RECORD_NAME: The name of the record to be added to the hosted zone for the sigv4 signing service. This will be the hosted zone root name prefixed with a value for the sigv4 signing subdomain.
- CERTIFICATE_ARN: The ARN of the preexisting ACM certificate that corresponds to hosted zone being used.
- TAG_SERVICE: Standard tagging requirement for the service the app is part of
- TAG_FUNCTION: Standard tagging requirement for the function the app performs
- TAG_LANDSCAPE: Standard tagging requirement for identifying the environment the deployment serves for.

##### Example

An example context file comes with this repo, `./context/_example-context.json`. It shows all possible parameters that can be used to create the wordpress stack and serves as a reference in so far as the values say a lot about the parameter itself:

```
{
  "SCENARIO": "s3proxy",
  "STACK_ID": "s3proxy2",
  "PREFIXES": {
    "wordpress": "jaydubbulb",
    "s3proxy": "sigv4",
    "rds": "rds"
  },
  "ACCOUNT": "770203350335",
  "REGION": "us-east-1",
  "VPC_ID": "vpc-0290de1785982a52f",
  "CIDRS": [
    {
      "name": "campus1", 
      "cidr": "168.122.81.0/24"
    },
    {
      "name": "campus2", 
      "cidr": "168.122.82.0/23"
    },
    {
      "name": "campus3", 
      "cidr": "168.122.76.0/24"
    },
    {
      "name": "campus4", 
      "cidr": "168.122.68.0/24"
    },
    {
      "name": "campus5", 
      "cidr": "168.122.69.0/24"
    },
    {
      "name": "wp-app-dv02", 
      "cidr": "168.122.81.0/24"
    }
  ],
  "CAMPUS_SUBNET1": "subnet-06edbf07b7e07d73c",
  "CAMPUS_SUBNET2": "subnet-0032f03a478ee868b",
  "DOCKER_IMAGE_SIGV4": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
  "DOCKER_IMAGE_WORDPRESS": "770203350335.dkr.ecr.us-east-1.amazonaws.com/wrhtest:jaydub-bulb",
  "BUCKET_USER_SECRET_NAME": "wordpress-protected-s3-assets-jaydub-user/AccessKey",
  "OLAP": "wordpress-protected-s3-assets-jaydub-olap",
  "HOSTED_ZONE": "kualitest.research.bu.edu",
  "S3PROXY_RECORD_NAME": "s3proxy.kualitest.research.bu.edu",
  "CERTIFICATE_ARN": "arn:aws:acm:us-east-1:770203350335:certificate/117fad49-d620-4bd3-a624-879f3fbd7ab7",
  "WORDPRESS_SECRET_NAME": "wrhtest",
  "WORDPRESS_SERVER_NAME": "dev.kualitest.research.bu.edu",
  "WORDPRESS_SP_ENTITY_ID": "https://*.kualitest.research.bu.edu/shibboleth",
  "WORDPRESS_IDP_ENTITY_ID": "https://shib-test.bu.edu/idp/shibboleth",
  "WORDPRESS_FORWARDED_FOR_HOST": "jaydub-bulb.cms-devl.bu.edu",
  "WORDPRESS_TZ": "America/New_York",
  "TAGS": {
    "Service": "websites",
    "Function": "wordpress",
    "Landscape": "devl"
  }
}
```

### Scenarios

- Standard standalone s3proxy service *(no wordpress, database, etc)*:

  ```
  {
    "SCENARIO": "s3proxy",
    "STACK_ID": "s3proxy",
    "PREFIXES": {
      "s3proxy": "sigv4"
    },
    "ACCOUNT": "037860335094",
    "REGION": "us-east-1",
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
  
  - A [bu-protected-s3-object-lambda](https://github.com/bu-ist/bu-protected-s3-object-lambda/tree/main) stack pre-exists, has a secret and object lambda access endpoint that match the "`bucketUserSecretName`" and "`OLAP`" parameters respectively, and had an asset uploaded as follows:
  
    ```
    aws --profile=bu s3 cp cuba-abroad-banner-compressed.jpg s3://wordpress-protected-s3-assets-dev-assets/original_media/jaydub-bulb.cms-devl.bu.edu/admissions/files/2018/09/
    ```
  
  ...then, you should be able to see the `cuba-abroad-banner-compressed.jpg` image in your browser at the following url:
  
  ```
  http://s3proxy-alb-1028790297.us-east-2.elb.amazonaws.com/jaydub-bulb.cms-devl.bu.edu/admissions/files/2018/09/cuba-abroad-banner-compressed.jpg
  ```
  
  
