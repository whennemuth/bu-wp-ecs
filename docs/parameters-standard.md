# Standard service (example)

Parameters to deploy a standard wordpress service, including the database and the s3proxy service as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html).
NOTE: mod_shib has been removed from the underlying docker image and replaced with reduced responsibility that delegates authentication to a lambda@edge origin request function with its cloudfront distribution. The docker image upon which the main wordpress container is based has these changes reflected in its baseline image, and the second stage portion of the build is based on a manifest .ini file that modifies those bu-specific php customizations dealing with authentication to accomodate this. *(example: `MANIFEST_INI_FILE=wp-manifests/devl/jaydub-bulb.ini`)*

*Note that `WORDPRESS.env.s3ProxyHost` is removed entirely, which means the necessary default to `"localhost"`* for sidecar reference.

```
{
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
  "DNS": {
    "hostedZone": "warhen.work",
    "subdomain": "wp1.warhen.work",
    "certificateARN": "arn:aws:acm:us-east-2:037860335094:certificate/f95a0e60-a924-4fdb-9cd2-1f5dc872ab99",
    "cloudfront": {
      "challengeHeaderName": "cloudfront-challenge",
      "challengeSecretFld": "cloudfront-challenge"
    },
    "includeRDS": false
  },
  "S3PROXY": {
    "dockerImage": "public.ecr.aws/bostonuniversity-nonprod/aws-sigv4-proxy:latest",
    "bucketUserSecretName": "wordpress-protected-s3-assets-dev-user/AccessKey",
    "OLAP": "wordpress-protected-s3-assets-dev-olap"
  },
  "WORDPRESS": {
    "dockerImage": "037860335094.dkr.ecr.us-east-2.amazonaws.com/bu-wordpress-build:lambda-weblogin-shibless",
    "env": {
      "debug": true
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
