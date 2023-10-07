# Standard composite service (example)

Parameters to deploy a standard wordpress service, including the database and the s3proxy service as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html)

*Note that `WORDPRESS.env.s3ProxyHost` is removed entirely, which means the necessary default to `"localhost"`* for sidecar reference.

```
{
  "SCENARIO": "composite",
  "STACK_ID": "wp",
  "STACK_NAME": "wordpress-fargate-service",
  "STACK_DESCRIPTION": "The standard Boston University Wordpress service.",
  "PREFIXES": {
    "wordpress": "jaydubbulb",
    "s3proxy": "sigv4",
    "rds": "rds"
  },
  "ACCOUNT": "037860335094",
  "REGION": "us-east-2",
  "CIDRS": {
    "dbreport1": "168.122.78.128/28",
    "dbreport2": "168.122.84.240/28"
  },
  "S3PROXY": {
    "dockerImage": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
    "bucketUserSecretName": "wordpress-protected-s3-assets-dev-user/AccessKey",
    "OLAP": "wordpress-protected-s3-assets-dev-olap"
  },
  "WORDPRESS": {
    "dockerImage": "037860335094.dkr.ecr.us-east-2.amazonaws.com/bu-wordpress-baseline:latest",
    "env": {
      "serverName": "dev.kualitest.research.bu.edu",
      "spEntityId": "https://*.kualitest.research.bu.edu/shibboleth",
      "idpEntityId": "https://shib-test.bu.edu/idp/shibboleth",
      "forwardedForHost": "jaydub-bulb.cms-devl.bu.edu",
      "TZ": "America/New_York",
      "debug": "true",
      "dbType": "serverless",
      "dbUser": "root",
      "dbName": "wp_db",
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

