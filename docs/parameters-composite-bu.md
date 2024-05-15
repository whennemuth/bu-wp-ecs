# BU composite service (example)

Parameters to deploy a Boston University wordpress service, including the database and the s3proxy service as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html)

*Note that `WORDPRESS.env.s3ProxyHost` is removed entirely, which means the necessary default to `"localhost"`* for sidecar reference.

```
{
  "SCENARIO": "composite",
  "STACK_ID": "wp",
  "STACK_NAME": "wordpress-fargate-service",
  "STACK_DESCRIPTION": "The Common security services Boston University Wordpress service",
  "PREFIXES": {
    "wordpress": "jaydubbulb",
    "s3proxy": "sigv4",
    "rds": "rds"
  },
  "ACCOUNT": "770203350335",
  "REGION": "us-east-1",
  "VPC_ID": "vpc-0290de1785982a52f",
  "CIDRS": {
    "campus1": "168.122.81.0/24",
    "campus2": "168.122.82.0/23",
    "campus3": "168.122.76.0/24",
    "campus4": "168.122.68.0/24",
    "campus5": "168.122.69.0/24",
    "wp-app-dv02": "168.122.81.0/24",
    "dbreport1": "168.122.78.128/28",
    "dbreport2": "168.122.84.240/28"
  },
  "SUBNETS": {
    "campus1": "subnet-06edbf07b7e07d73c",
    "campus2": "subnet-0032f03a478ee868b"
  },
  "DNS": {
    "hostedZone": "kualitest.research.bu.edu",
    "certificateARN": "arn:aws:acm:us-east-1:770203350335:certificate/117fad49-d620-4bd3-a624-879f3fbd7ab7",
    "includeRDS": "true"
  },
  "S3PROXY": {
    "dockerImage": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
    "bucketUserSecretName": "wordpress-protected-s3-assets-jaydub-user/AccessKey",
    "OLAP": "wordpress-protected-s3-assets-jaydub-olap"
  },
  "WORDPRESS": {
    "dockerImage": "770203350335.dkr.ecr.us-east-1.amazonaws.com/wrhtest:jaydub-bulb",
    "env": {
      "spEntityId": "https://*.kualitest.research.bu.edu/shibboleth",
      "idpEntityId": "https://shib-test.bu.edu/idp/shibboleth",
      "forwardedForHost": "jaydub-bulb.cms-devl.bu.edu",
      "TZ": "America/New_York",
      "debug": "true",
      "dbType": "serverless",
      "dbUser": "root",
      "dbName": "wp_db",
      "dbPort": "3306",
      "dbHost": ""
    },
    "secret": {
      "arn": "arn:aws:secretsmanager:us-east-2:037860335094:secret:dev/wp/shib-sp-test-JML3FN",
      "fields": {
        "dbPassword": "password",
        "configExtra": "wp-config-extra",
        "spKey": "wp-sp-key",
        "spCert": "wp-sp-cert"
      }      
    }
  },
  "TAGS": {
    "Service": "websites",
    "Function": "wordpress",
    "Landscape": "devl"
  }
}
```

