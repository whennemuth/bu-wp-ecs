# Standard standalone wordpress service (example)

Parameters to deploy a standalone wordpress fargate service *(database and s3proxy service must pre-exist and whose details must be included)*:

```
{
  "SCENARIO": "wordpress",
  "STACK_ID": "wp",
  "STACK_NAME": "wordpress-fargate-service",
  "STACK_DESCRIPTION": "Standalone Boston University fargate service for wordpress.",
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
  "WORDPRESS": {
    "dockerImage": "037860335094.dkr.ecr.us-east-2.amazonaws.com/bu-wordpress-baseline:latest",
    "env": {
      "spEntityId": "https://*.kualitest.research.bu.edu/shibboleth",
      "idpEntityId": "https://shib-test.bu.edu/idp/shibboleth",
      "forwardedForHost": "jaydub-bulb.cms-devl.bu.edu",
      "s3ProxyHost": "s3proxy.kualitest.research.bu.edu",
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

