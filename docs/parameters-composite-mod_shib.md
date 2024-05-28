# Standard composite service with mod_shib (example)

Parameters to deploy a standard wordpress service, including the database and the s3proxy service as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html).
The main wordpress container is performing the shibboleth client role and it is assumed that the image upon which the container is based is using mod_shib to authenticate with the IDP. This is in contrast to the standard composite scenario where mod_shib has been removed from the underlying docker image and replaced with reduced responsibility that delegates authentication to a lambda@edge origin request function with its cloudfront distribution - *See [./parameters-composite.md](,/parameters-composite.md) for details of this.*

*Note that `WORDPRESS.env.s3ProxyHost` is removed entirely, which means the necessary default to `"localhost"`* for sidecar reference.

```
{
  "SCENARIO": "composite",
  "STACK_ID": "wp",
  "STACK_NAME": "wp-stack",
  "STACK_DESCRIPTION": "The standard Boston University Wordpress service",
  "PREFIXES": {
    "wordpress": "app",
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
  "WORDPRESS": {
    "dockerImage": "037860335094.dkr.ecr.us-east-2.amazonaws.com/bu-wordpress-build:latest",
    "env": {
      "spEntityId": "https://*.kualitest.research.bu.edu/shibboleth",
      "idpEntityId": "https://shib-test.bu.edu/idp/shibboleth",
      "TZ": "America/New_York",
      "debug": true,
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

