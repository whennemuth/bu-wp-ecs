# BU Wordpress ECS stack

A CDK app with an instance of a stack (`BuWordpressEcsStack`) that creates an ecs cluster for Boston University wordpress websites.

## Overview

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla mattis felis quis lectus lobortis, quis tincidunt lectus semper. Nullam vel magna lectus. Vestibulum venenatis in lorem eu rhoncus. Maecenas molestie dignissim augue, a sagittis lorem molestie eget. In fringilla euismod dui, eu consequat justo. Ut sit amet tempor orci. Morbi malesuada convallis urna sed tincidunt. Nam faucibus ante tortor. Fusce cursus tincidunt ex, vel blandit dolor fermentum non. Quisque eget mattis leo, non pulvinar enim. Vestibulum sodales massa ac est finibus viverra. Aliquam in vehicula libero, quis ultrices ante. Suspendisse ultrices neque nec nibh auctor, in vehicula nulla mollis. Suspendisse lobortis quam eget sem sodales, in mattis odio pharetra.

## Prerequisites

- AWS CDK
- AWS CLI
- Node, NPM
- Git
- Admin role for target BU CSS account *(ie: Shibboleth-InfraMgt/yourself@bu.edu)*



*Commands scratchpad (work into documentation properly later)*:

```
cdk synth --profile infnprd &> cdk.out/BuWordpressEcsStack.template.yaml

cdk deploy --profile infnprd --no-rollback

MSYS_NO_PATHCONV=1 && \
docker run --rm -ti \
  -e 'AWS_ACCESS_KEY_ID=[key]' \
  -e 'AWS_SECRET_ACCESS_KEY=[secret]' \
  -e 'healthcheck_path=/' \
  -p 8080:8080 \
  aws-sigv4-proxy -v --name s3-object-lambda --region us-east-1 --no-verify-ssl
```

