# CDK context parameters

The following are parameters for the CDK deployment. Most of them can be regarded as equivalent to cloud-formation parameters, but others may be used by the CDK code for flow control, where it is possible to branch into alternate or modified patterns and drive [composition](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html#constructs_composition). 

### contexts/context.json

This file defines all parameters that comprise the [context](https://docs.aws.amazon.com/cdk/v2/guide/context.html) for the stack. Combined, the majority of them define a stack that will include:

1. A [Fargate service](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
2. A [MySQL RDS database](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_MySQL.html)

Certain other parameters will vary stack output to either broaden the stack with other resources, or modify the default behavior of the two primary constructs above:

- Include a [Redis caching service](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/WhatIs.html)
- Relocate shibboleth authentication to an exterior cloudfront-driven SP, with simplified wordpress containers that omit mod_shib
- Activate custom [application auto-scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/getting-started.html)
- Vary between a developer stack that uses a self-signed certificate, and a stack that includes [certificate manager](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html) and [route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)

Conflicting or mutually exclusive parameter combinations will be caught by validation logic and deployment blocked.

### Available Parameters

- STACK_ID: Top-level string identifier for the stack that will go into the naming of most created resources.
- STACK_NAME: The name of the stack will be shown in the cloudformation management console.
- STACK_DESCRIPTION: The description of the stack as will be shown in the cloudformation management console.
- PREFIXES: Mid-level string identifier for specific constructs *(wordpress, s3proxy, rds)*
- ACCOUNT: The number of the aws account being deployed to.
- REGION: The region being deployed to.
- DNS:
  - hostedZone: The name of a preexisting hosted zone for which a new "A" record will created to route traffic to the ALB created for wordpress.
  - includeRDS: Add a new record to the wordpress route53 hosted zone for the  the RDS database. This will allow for addressing connections to the database using something like `"dev.db.warhen.work"`as an alternative to the automatically assigned socket address.
  - certificateARN: The ARN of the preexisting ACM certificate that corresponds to hosted zone being used.
- S3PROXY:
  - dockerImage: The docker tag for the customized s3proxy docker container in a public docker registry, like the BU ECR
  - bucketUserSecretName: The name of the secret that containers the credentials for the user whose role grants access to the s3 proxy signing service. Contains:
    - bucket: The name of the bucket
    - aws_access_key_id
    - aws_secret_access_key
    - aws_region
  - OLAP: The name of the object lambda access point targeted by s3proxy container.
- WORDPRESS:
  - dockerImage: The docker tag for the image the container for the wordpress [task definition](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html) will use.
  - env:
    - serverName: The name of the apache virtual host for wordpress. *(See [apache servername directive](https://httpd.apache.org/docs/2.4/mod/core.html#servername))*
    - spEntityId: The shibboleth SP entity ID as known by the IDP. In shibboleth.xml: `ApplicationDefaults.entityID`
    - idpEntityId: The shibboleth IDP entity ID. In shibboleth.xml: `ApplicationDefaults.Sessions.SSO.entityID`
    - s3ProxyHost: The value to set for the [ProxyPass directive](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html#proxypass) that identifies the host name of the sigv4 signing service. If the ECS task for this service runs independently, this value will be the hosted zone root name prefixed with a value for the sigv4 signing subdomain. If the ECS container hosting the s3 proxying service runs as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html) to the wordpress service, then its value is simply `"localhost"` *(default)*.
    - TZ: The timezone that the wordpress docker container is to use by way of setting this value as an environment variable.
    - debug: *defaults to `"false"`*. `"true"` indicates WORDPRESS_DEBUG=1 where any non-empty value will enable `WP_DEBUG` in `wp-config.php`
    - dbType: *defaults to `"serverless"`*
      - ["instance"](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.DBInstance.html)
      - ["cluster"](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html)
      - ["serverless"](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
    - dbUser: *defaults to `"root"`*
    - dbName: *defaults to `"wp_db"`*
    - dbHost: Usually omitted as this field will have values auto-generated as follows:
      - DNS.hostedZone is present:
        A CNAME record will automatically be appended to the pre-existing route53 hosted zone with a subdomain for the rds service. This will be the host value.
      - DNS.hostedZone is NOT present:
        The dynamically generated dns for the rds instance/cluster will be referenced: 
  - secret:
    *SEE: [Using Secrets Manager](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html) for background information on how secrets work as environment variables with ECS*
    - name: The name of a secrets manager secret that contains passwords and other sensitive settings for wordpress.
    - fields:
      - dbUser: The name of the entry in the secret that contains the user name of the administrator of the wordpress mysql database.
        *NOTE: The [Credentials.fromSecret](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.Credentials.html#static-fromwbrsecretsecret-username) cdk method expects this value to be `"username"`*
      - dbPassword: The name of the entry in the secret that contains the password for the wordpress mysql database.
        *NOTE: The [Credentials.fromSecret](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.Credentials.html#static-fromwbrsecretsecret-username) cdk method expects this value to be `"password"`*
      - configExtra: The name of the entry in the secret that contains the "WORDPRESS_CONFIG_EXTRA" content to be added dynamically to the wp-config.php file as documented [here](https://github.com/docker-library/wordpress/pull/142).
      - spKey: The signing key for authentication with the BU shibboleth IDP. Documented [here](https://shibboleth.atlassian.net/wiki/spaces/CONCEPT/pages/948470554/SAMLKeysAndCertificates#SAMLKeysAndCertificates-SigningKeyandCertificate)
      - spCert: The signing cert for authentication with the BU shibboleth IDP. Documented [here](https://shibboleth.atlassian.net/wiki/spaces/CONCEPT/pages/948470554/SAMLKeysAndCertificates#SAMLKeysAndCertificates-SigningKeyandCertificate)
- TAGS:
  - Service: Standard tagging requirement for the service the app is part of. Defaults to "websites"
  - Function: Standard tagging requirement for the function the app performs. Defaults to "wordpress"
  - Landscape: Standard tagging requirement for identifying the environment the deployment serves for.
    "prod", "test", "devl", etc. This value is also integrated into naming and attributes for cloud-formed resources for uniqueness.



### Examples:

- [Standard service](./parameters-standard.md) *(fargate cluster and database)*

- [Standard service with mod_shib](./parameters-mod_shib.md) *(same as Standard service, but the wordpress container performs the shibboleth client services)*
