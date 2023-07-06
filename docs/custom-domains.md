# Custom domains

In addition to the default domain allocated to each function and container, you can also set one or more custom domains.

You can find more information in the Scaleway docs on how to [add custom domains to functions](https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/) or
[add custom domains on containers](https://www.scaleway.com/en/docs/compute/containers/how-to/add-a-custom-domain-to-a-container/).

You can configure custom domains via your `serverless.yml` too, e.g.:

```yaml
functions:
  first:
    handler: handler.handle
    custom_domains:
      - my-domain.somehost.com
      - my-other-domain.somehost.com
```

Note that you must have a `CNAME` record set up in each domain's DNS configuration, which points to the endpoint of your function or container

**NOTE**: if you create a domain with other tools (e.g. the Scaleway console, the CLI or APIs) you must also add the created domain to your `serverless.yml`. If not, it will be deleted by your Serverless Framework deployment.
