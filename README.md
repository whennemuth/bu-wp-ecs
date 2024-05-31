# Wordpress ECS stack

A CDK app that creates and deploys a [Cloudformation][https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html] stack comprising an [ecs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) [cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) for wordpress websites and related services.

### Overview

Currently, this deployment sets up an [ecs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html) [cluster](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html) for running wordpress websites, of one [ecs service](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_services.html). The ecs service runs a task that comprises two [container definitions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#container_definitions).

1. **Wordpress**:
   The obvious container is one that hosts wordpress itself. In mind is something that can grow to be a candidate for hosting [Boston University wordpress websites](https://www.bu.edu/tech/services/cccs/websites/www/wordpress/).
1. **SigV4:**
   This deployment makes assumptions about from where wordpress assets are obtained. The common setup for that would be with wordpress running against apache, which in turn maps requests for assets to locations in the file system of the same host. That approach is modified here such that those assets are stored in S3 and apache no longer retrieves them from its file system, but proxies the asset requests to corresponding locations within an s3 bucket over http. To implement the proper authorization and asset management, requests are routed through [s3 object lambda access points *(olap)*](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-objects.html). In order for apache to proxy requests to olap, it must apply the required signature *[(sigv4)](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html)* to them. This suggests a second container, one that is based on [aws-sigv4-proxy](https://github.com/awslabs/aws-sigv4-proxy) and can run as a ["sidecar"](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/fargate-security-considerations.html) to the wordpress container, and to which the apache service can proxy requests to and have them signed enroute to the olap.

TODO: Include architectural explanation and diagram here.

### Prerequisites

- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS CLI](https://aws.amazon.com/cli/)
- [Node & NPM](https://nodejs.org/en/download)
- [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- Admin role for target account *(ie: Shibboleth-InfraMgt/yourself@bu.edu, for the BU CSS account)*

### Steps

1. Create a `./context/context.json` file.
   This file will contain all parameters that the cdk will use when generating the Cloudformation template it later deploys. Most of these parameters correspond to something one might otherwise use as values being supplied to Cloudformation if it were being invoked directly, but they will appear "hard-coded" in the stack template. [From CDK docs on parameters](https://docs.aws.amazon.com/cdk/v2/guide/parameters.html):

   > *In general, we recommend against using AWS CloudFormation parameters with the AWS CDK. The usual ways to pass values into AWS CDK apps are [context values](https://docs.aws.amazon.com/cdk/v2/guide/context.html) and environment variables. Because they are not available at synthesis time, parameter values cannot be easily used for flow control and other purposes in your CDK app.*

   The following link details all context values with explanation on how to use them to modify or broaden CDK resource output. 
   
   - [Parameters](./docs/parameters.md)
   
2. Obtain [security credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html?icmpid=docs_homepage_genref) for the admin-level [IAM role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) you will be using for accessing the aws account to lookup and/or deploy resources.
   Create a [named profile](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-using-profiles) out of these credentials in your [`~/.aws/credentials`](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html#cli-configure-files-where) file.
   
2. Install all dependencies:
  
   ```
   npm install
   ```
   
3. *Bootstrapping* is the process of provisioning resources for the AWS CDK before you can deploy AWS CDK apps into an AWS [environment](https://docs.aws.amazon.com/cdk/v2/guide/environments.html). *(An AWS environment is a combination of an AWS account and Region).* You only need to bootstrap once for your chosen region within your account. The presence of a `"CDKToolKit"` cloud-formation stack for that region will indicate bootstrapping has already occurred. To bootstrap, follow [these steps](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-howto). The simple bootstrapping command is:

   ```
   export AWS_PROFILE=my_named_profile
   cdk bootstrap aws://[aws account ID]/us-east-1
   ```

5. [OPTIONAL] Run the [CDK synth command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-synth) command to generate the cloudformation template that will be used to create the stack:

   ```
   mkdir ./cdk.out 2> /dev/null
   npm run synth
   ```

   *NOTE: The synth command will create a .json file, but will also output yaml to stdout. The command above redirects that output to a ./cdk.out/Stack.yaml.*

3. Run the [CDK deploy command](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-deploy) to create the stack:

   ```
   npm run deploy
   ```
   
7. Visit the wordpress site.
   The [ApplicationLoadBalancedFargateService construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html) automatically produces 2 stack outputs. One is the alb public endpoint, and the other is the service endpoint. If you had included DNS parameters in the CDK app configuration to go through route53, the service endpoint would conform to that value, example:

   ```
   http://dev.kualitest.research.bu.edu
   ```

   Alternatively, the use of a self-signed certificate would be automatically come into play and the stack output would be the alb public address:

   ```
   http://wp-jaydubbulb-alb-devl-1906413712.us-east-2.elb.amazonaws.com
   ```

   So, if the s3 bucket associated with the object lambda access point configured in `S3PROXY.OLAP` of `./contexts/context.json`, is called `"wordpress-protected-s3-assets-dev-assets"`, and there is a jpg asset in that bucket at:

   ```
   s3://wordpress-protected-s3-assets-dev-assets/original_media/jaydub-bulb.cms-devl.bu.edu/admissions/files/2018/09/cuba-abroad-banner-compressed.jpg
   ```

   then you can have that asset served up to you via wordpress using the following url:

   ```
   https://wp-jaydubbulb-alb-devl-1906413712.us-east-2.elb.amazonaws.com/admissions/files/2018/09/cuba-abroad-banner-compressed.jpg
   ```

   

### Notes

**Shibboleth SP:**
In a BU wordpress fargate stack, the shibboleth SP can reside in one of two places:

1. Mod_shib: The traditional setup in which wordpress containers running apache would have mod_shib installed, and authentication with shibboleth would be carried out from within. ***NOTE**: Omit the DNS.cloudfront item from the context parameters to engage this setup*.
2. A newer option is available to build the Fargate cluster such that the Wordpress containers running in it no longer involve themselves with being saml SP clients to shibboleth using the mod_shib module. A "Cloudfront" option has been added to the "DNS" item of the context parameters to opt for this situation be serviced by a pre-existing Cloudfront distribution that takes over this saml client role *(**NOTE:** You must include the DNS.cloudfront item in the context parameters to engage this setup)*. Currently, this Cloudfront distribution is created in a separate CDK stack and it should be  configured to target the ALB of this stack, once it becomes available, as an origin. A lambda@edge origin request function within this separate stack processes all incoming requests and carries out the saml negotiations with the BU shibboleth IDP. This has a few implications:
   1. Certificates.
      Cloudfront is a global resource and so will always address an ALB origin over the internet. This means that the ALB must be internet facing and will need to take traffic encrypted with the same certificate that is used for the domain of the Cloudfront distribution. For example, if a the Cloudfront distribution is reachable on https://dev.mydomain.com, then the corresponding certificate - probably with CN *.mydomain.com - will reside in ACM in the same account as the Cloudfront distribution and will need to be requested again from the domain registrar into ACM for the account and region of the ALB. If this certificate is not applied to the ALB, the Cloudfront distribution responds with a 502 error.
   2. Security.
      Since the ALB must be internet facing, it must be locked down. In addition to only responding to https traffic, two additional measures are taken:
      1. The security group for the ALB must allow only ingress from Cloudfront IP address for the region of the distribution.
         A [Managed Prefix List](https://aws.amazon.com/blogs/networking-and-content-delivery/limit-access-to-your-origins-using-the-aws-managed-prefix-list-for-amazon-cloudfront/) for cloudfront is applied to the ALB security group as the only ingress rule.
      2. With ingress to the ALB restricted to the cloudfront service, now it must be further restricted to the specific SAML SP distribution.
         This distribution is configured to add a "secret" header value to each request it forwards to the ALB origin. The ALB is configured with a listener rule that allows through only requests that have this header and that its value matches the expected value. This approach is a standard AWS practice and is detailed here: [Restricting access to Application Load Balancers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html)
   3. The Wordpress docker image.
      A docker image for BU wordpress must be specified in context.json that corresponds to something that was built against a manifest ini file that reflects modifications certain plugins and php that "assumes" the SP is still in the container. Specifically, weblogin.php is redirected to as usual, but it now looks for certain headers that identify login and logout urls and it simply delegates authentication by redirecting to these locations, which get intercepted by the cloudfront lambda@edge function, which identifies them by path as something it should take over.

**Miscellaneous:**
Some discoveries specific to certain AWS services and related items were found to be of help in development of this project, and are worth noting separately. Also, a more detailed explanation and reasoning behind approaches taken is included. 

- [Stack Parameters](./docs/parameters.md)
- [Fargate](./docs/fargate.md)
- [CDK](./docs/cdk.md)
- [Autoscaling](./docs/autoscaling.md)
