# Technical debt

The following are either required todo items, or items to be put under consideration.

1. Refactor parameters? (Possibly bring closer to what's documented [here](https://docs.aws.amazon.com/cdk/v2/guide/get_context_var.html)).
   Currently `""resolveJsonModule": true"` is added to compilerOptions in tsconfig.json to allow for importing json configuration files into modules as if they were javascript. For example:

   ```
   import * as context from '../contexts/context.json';
   ```

2. Use [AWS Cloudformation Guard](https://docs.aws.amazon.com/cfn-guard/latest/ug/what-is-guard.html)?