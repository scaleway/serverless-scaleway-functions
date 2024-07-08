# Security and secret management

We do not recommend hard-coding secrets in your `serverless.yml` file. Instead you can use environment variable substitution in your `serverless.yml`.

These environment variables can come directly from your deployment environment, or be stored in a `.env` file. A sample configuration looks like:

```yml
# Enable use of .env file
useDotenv: true

provider:
  name: scaleway
  runtime: node22

functions:
  my-func:
    handler: handler.py

    # Template environment variables from .env file and/or environment variables
    secret:
      MY_SECRET: ${env:SOME_SECRET}
      MY_OTHER_SECRET: ${env:SOME_OTHER_SECRET}
```

A `.env` file can be placed alongside your `serverless.yml` file, which looks like:

```bash
SOME_SECRET=XXX
SOME_OTHER_SECRET=XXX
```
