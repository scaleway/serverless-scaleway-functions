# Custom domains

Custom domains allow users to use their own domains.

>**Note**:
Refer to [custom domains on functions](https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/) or
[custom domains on containers](https://www.scaleway.com/en/docs/compute/containers/how-to/add-a-custom-domain-to-a-container/) for more information about domain configuration.

Integration with serverless framework example:

```yaml
functions:
  first:
    handler: handler.handle
    # Local environment variables - used only in given function
    env:
      local: local
    custom_domains:
      - func1.scaleway.com
      - func2.scaleway.com
```

- >**Note**:
Your domain must have a record pointing to your function hostname. You should deploy your function once to read its hostname. The configuration of custom domains becomes available after the first deploy.

- >**Note:**
Serverless Framework considers the configuration file as the source of truth.

- >**Important**:
If you create a domain with other tools (the Scaleway console, the CLI or APIs) you must refer the created domain into your serverless configuration file. Otherwise it will be deleted as serverless framework will give the priority to its configuration.
