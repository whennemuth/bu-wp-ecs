# Things to watch out for

The following is collection of hidden or commonly missed features to keep in mind for this project - business requirement peculiarities, CDK specifics, etc.

- CDK context lookup method return values are stored in cache, which may need to be evicted if "pointing" at different resources or accounts.
  Also, it is important to note the following:
  
  > ###### *Important*
  >
  > *Because they're part of your application's state, `cdk.json` and `cdk.context.json` must be committed to source control along with the rest of your app's source code. Otherwise, deployments in other environments (for example, a CI pipeline) might produce inconsistent results.*
  
  Something to keep in mind.