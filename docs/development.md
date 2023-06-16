# Development

To run Serverless Framework with a local checkout of this plugin, you can modify the `serverless.yml` for one or more functions as follows:

```yaml
...

# Change this
plugins:
  - serverless-scaleway-functions

# To this
plugins:
  - <path to checkout of this project>
```

Then you can run commands as normal.
