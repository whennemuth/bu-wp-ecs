# CDK context parameters

The following are parameters for the CDK deployment. Most of them can be regarded as equivalent to cloud-formation parameters, but others may be used by the CDK code for flow control, where it is possible to branch into alternate patterns and drive [composition](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html#constructs_composition). 

### Scenarios

There are a number of "scenarios" to pick from when deploying a stack. A scenario basically maps to use of a specific cdk [construct](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html). For example the scenario could indicate part of the overall wordpress service, like just the database, or just the s3proxy signing service. Or, a scenario can specify a higher level construct that groups all such lower level constructs into a single deployment. A scenario can also specify standard vs. modified approaches:

- **Standard**: A "Clean sheet of paper" baseline deployment that models aws recommended best practices. Provides a "standard" deployment of the construct as one would conduct in an unconstrained aws account, accepting most defaults.
- **Modified**: Requires specific overrides/extensions that apply when working with an aws account that has a set of infrastructure and multi-tenancy pre-conditions. An example of this is the BU common security services accounts, where for example, there is a specific set of vpc/subnet infrastructure to deploy into.

Depending on the scenario that applies, only a subset of the following parameters may be required. The complete listing is below, followed by examples that serve as a breakdown of each scenario and which of these parameters comprise the subset that are relevant to that scenario:

### Available Parameters

- SCENARIO: The ecs type: "wordpress-bu" or "s3proxy".
- STACK_ID: Top-level string identifier for the stack that will go into the naming of most created resources.
- STACK_NAME: The name of the stack will be shown in the cloudformation management console.
- STACK_DESCRIPTION: The description of the stack as will be shown in the cloudformation management console.
- PREFIXES: Mid-level string identifier for specific constructs *(wordpress, s3proxy, rds)*
- ACCOUNT: The number of the aws account being deployed to.
- REGION: The region being deployed to.
- DNS:
  - hostedZone: The name of a preexisting hosted zone for which a new "A" record will created to route traffic to the ALB created for wordpress.
    The "A"
  - includeRDS: Add a new record to the wordpress route53 hosted zone for the  the RDS database. This will allow for addressing connections to the database using something like `"dev.db.kualitest.research.bu.edu"`as an alternative to the automatically assigned socket address.
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
    - forwardedForHost: The value to set for the X-Forwarded-Host request header that is added to all requests for assets as they are proxied to the container for signing (sigv4). This value will ensure that the asset is acquired from within the correct "site" directory of the s3 bucket.
    - s3ProxyHost: The value to set for the [ProxyPass directive](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html#proxypass) that identifies the host name of the sigv4 signing service. If the ECS task for this service runs independently, this value will be the hosted zone root name prefixed with a value for the sigv4 signing subdomain. If the ECS container hosting the s3 proxying service runs as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html) to the wordpress service, then its value is simply `"localhost"` *(default)*.
    - TZ: The timezone that the wordpress docker container is to use by way of setting this value as an environment variable.
    - debug: set to true or false. True indicates WORDPRESS_DEBUG=1 where any non-empty value will enable `WP_DEBUG` in `wp-config.php`
    - dbType: *[default: "serverless"]*
      - ["instance"](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.DBInstance.html)
      - ["cluster"](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html)
      - ["serverless"](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
    - dbUser: *defaults to `"root"`*
    - dbName: *defaults to `"wp_db"`*
    - dbHost: In a composite scenario, where the both the wordpress and rds services are being created, you can omit this field and have the values auto-generated as follows:
      - DNS.hostedZone is present:
        A CNAME record will automatically be appended to the pre-existing route53 hosted zone with a subdomain for the rds service.
        So, if the DNS.hostedZone
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

- Below is a listing of example configurations for each of the different scenarios:
- [Standard standalone wordpress service](./parameters-wordpress.md) *(database and s3proxy service must pre-exist and whose details must be included)*.
- [Standard composite service](./parameters-composite.md) *(database is also created along with the s3proxy service as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html))*
- [Standard composit service with mod_shib](./parameters-composite-mod_shib.md) *(same as Standard composite service, but the wordpress container performs the shibboleth client services)*
