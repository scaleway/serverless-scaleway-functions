# Scaleway plugin for Serverless Framework

Plugin for using Scaleway [Serverless Functions](https://www.scaleway.com/en/serverless-functions/) and [Serverless Containers](https://www.scaleway.com/en/serverless-containers/) with [Serverless Framework](https://serverless.com/).

## Requirements

- [Serverless Framework v3 CLI](https://serverless.com) installed on your local computer (e.g. run `npm install serverless@3.39.0 -g`). V4 is not supported.
- [Scaleway CLI](https://www.scaleway.com/en/cli/) installed on your local computer

If you are using [Scaleway IAM](https://www.scaleway.com/en/iam/), you need to be the Owner of the Scaleway Organization in which the deployment will take place, or be an IAM user of the Organization with a policy granting you the necessary Permission Sets. See the [IAM Overview](https://www.scaleway.com/en/docs/identity-and-access-management/iam/reference-content/overview/) for more information.

## Quick start

1. Export the template you wish to use (see the list [here](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples)). We will use `python3`:

```shell
export TEMPLATE=python3
```

2. Create a function from this template:

```shell
serverless create \
  --path ${TEMPLATE}-func \
  --template-url https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/${TEMPLATE}
```

3. Install dependencies:

```shell
cd ${TEMPLATE}-func
npm i
```

4. Deploy the function:

```shell
serverless deploy
```

5. Invoke the function (note that `first` is the function name in this example):

```shell
serverless invoke --function first
```

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Supported commands](#supported-commands)
- [Unsupported commands](#unsupported-commands)
- [Useful links](#useful-links)
- [Contributing](#contributing)
- [License](#license)

More detailed documentation can be found in the [`docs`](docs/) folder, including:

- [Managing containers](docs/containers.md)
- [Configuring custom domains](docs/custom-domains.md)
- [Handling events (e.g. CRONs)](docs/events.md)
- [Security and secret management](docs/secrets.md)
- [Troubleshooting](docs/troubleshooting.md)

There are also language-specific notes for Serverless Functions:

- [Golang functions](docs/golang.md)
- [Javascript functions](docs/javascript.md)
- [PHP functions](docs/php.md)
- [Python functions](docs/python.md)
- [Rust functions](docs/rust.md)

## Configuration

With Serverless Framework, your functions and containers are defined in a `serverless.yml` file.

Each `serverless.yml` file corresponds to one function _or_ container namespace.

### General configuration

The following configuration is common to both functions and containers:

```yaml
# The name of your namespace
service: my-namespace

# Read environment variables from a .env file
useDotenv: false

# Use of this plugin. This must not be changed
plugins:
  - serverless-scaleway-functions

# Scaleway-specific configuration
provider:
  # Must not change
  name: scaleway

  # Runtime used for functions (unless overridden)
  # List: https://www.scaleway.com/en/docs/serverless/functions/reference-content/functions-lifecycle/#available-runtimes
  runtime: python310

  # Global environment variables, used in every function/container in this namespace
  env:
    MY_VAR: "some var"
    MY_OTHER_VAR: "some other var"

  # Global secrets, used in every function/container in this namespace
  secret:
    MY_SECRET: "some secret"
    MY_OTHER_SECRET: "some other secret"

  # Optional override of Scaleway credentials
  scwToken: <scw-token>
  scwProject: <scw-project-id>

  # Scaleway region for the deploy
  scwRegion: fr-par

# Include/exclude directories
package:
  patterns:
    - "!node_modules/**"
    - "!.gitignore"
    - "!.git/**"
```

### Function-specific configuration

To define functions, you can include a `functions` block:

```yaml
functions:
  my-func:
    # Handler entrypoint
    handler: handler.py

    # Minimum and maximum number of instances
    minScale: 0
    maxScale: 10

    # Memory limit (in MiB)
    # Limits: https://www.scaleway.com/en/docs/serverless/functions/reference-content/functions-limitations/
    memoryLimit: 1024

    # Maximum duration a request will wait to be served before it times out (in seconds)
    # Value in string format ex: "300s" (default: 300 seconds)
    timeout: 300s

    # Runtime for this function, allows overriding provider.runtime
    runtime: node20

    # How to handle HTTP. Options: enabled (allow HTTP), or redirected (redirect HTTP -> HTTPS)
    httpOption: enabled

    # Execution environment to use when running the function. Options: v1 (legacy), v2 (recommended, with improved cold starts)
    sandbox: v2

    # Controls privacy of the function. Options: public (no authentication), private (token-based authentication)
    privacy: public

    # Local environment variables, used only in this function
    env:
      LOCAL_VAR: "local var"

    # Local secrets, used only in this function
    secret:
      LOCAL_SECRET: "local secret"

    # Custom domains configured for the function
    # https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/
    custom_domains:
      - my-func.some.domain.com

    # List of events to trigger the function
    events:
      - schedule:
          rate: "1 * * * *"
          # Data passed as input in the request
          input:
            key-a: "value-a"
            key-b: "value-b"
```

### Container-specific configuration

To define containers, you can include a `custom.containers` block (note that you can only have `functions` _or_ `custom.containers`).

```yaml
custom:
  containers:
    my-container:
      # Subdirectory holding the Dockerfile, cannot be used with registryImage
      directory: container/

      # Name of the registry image, cannot be used with directory
      registryImage: nginx:latest

      # Minimum and maximum number of instances
      minScale: 0
      maxScale: 10

      # Configuration used to decide when to scale the container up or down
      scalingOption:
        # Can be one of: concurrentRequests, cpuUsage, memoryUsage
        type: concurrentRequests
        # Value to trigger scaling up
        # It's expressed in:
        # - concurrentRequests: number of requests
        # - cpuUsage: percentage of CPU usage
        # - memoryUsage: percentage of memory usage
        # Note that cpu and memory scaling are only available for minScale >= 1 containers
        threshold: 50

      # Memory limit (in MiB)
      # Limits: https://www.scaleway.com/en/docs/serverless/containers/reference-content/containers-limitations/
      memoryLimit: 1024

      # CPU limit for the container in mvCPU, chosen based on resource tiers if not set
      # Limits and tiers: https://www.scaleway.com/en/docs/serverless/containers/reference-content/containers-limitations/
      cpuLimit: 1000

      # Maximum duration a request will wait to be served before it times out (in seconds)
      # Value in string format ex: "300s" (default: 300 seconds)
      timeout: 300s

      # How to handle HTTP. Options: enabled (allow HTTP), or redirected (redirect HTTP -> HTTPS)
      httpOption: enabled

      # Execution environment to use when running the container. Options: v1 (legacy), v2 (recommended, with improved cold starts)
      sandbox: v2

      # Controls privacy of the container. Options: public (no authentication), private (token-based authentication)
      privacy: public

      # Local environment variables, used only in this container
      env:
        LOCAL_VAR: "local var"

      # Local secrets, used only in this container
      secret:
        LOCAL_SECRET: "local secret"

      # Custom domains configured for the function
      # https://www.scaleway.com/en/docs/serverless/containers/how-to/add-a-custom-domain-to-a-container/
      custom_domains:
        - my-container.some.domain.com

      # Health check configuration
      healthCheck:
        type: http # Or tcp if you only want to check that the port is open
        httpPath: /health
        interval: 10s
        failureThreshold: 3

      # List of events to trigger the container
      events:
        - schedule:
            rate: "1 * * * *"
            # Data passed as input in the request
            input:
              key-a: "value-a"
              key-b: "value-b"

      # Deprecated: number of simultaneous requests to handle
      # Please use scalingOption of type concurrentRequests instead
      # maxConcurrency: 20
```

## Supported commands

### `serverless deploy`

Note that by default `serverless deploy` applies the configuration located in your `serverless.yml` and removes functions in that namespace that are not in the file.

This can be switched off by setting the `singleSource` option to `false`.

### `serverless logs`

> [!WARNING]
> This command is deprecated and will be removed on March 12, 2024. Please refer to the documentation (for [functions](https://www.scaleway.com/en/developers/api/serverless-functions/#logs) and [containers](https://www.scaleway.com/en/developers/api/serverless-functions/#logs)) to continue getting your logs.
> TL;DR: You can still access function and container logs conveniently via the [Cockpit](https://www.scaleway.com/en/docs/observability/cockpit/how-to/access-grafana-and-managed-dashboards/) interface. Dedicated dashboards called "Serverless Functions Logs" and "Serverless Containers Logs" are accessible there.

The `serverless logs` command lets you watch the logs of a specific function or container.

You can fetch the logs of a specific function for with the `--function` option. You must specify the name of your function in the command.

```bash
serverless logs --function <function_or_container_name>
```

### `serverless info`

The `serverless info` command gives you information about your functions' or containers' current deployement state in JSON format.

## Unsupported commands

### `serverless invoke local`

`serverless invoke local` is **not supported** directly but instead we provide additional packages to install close to your handler.

Documentation is available through runtimes frameworks for:

- [Go](https://github.com/scaleway/serverless-functions-go)
- [Python](https://github.com/scaleway/serverless-functions-python)
- [Node](https://github.com/scaleway/serverless-functions-node)

## Useful links

- [Scaleway Serverless Functions Documentation](https://www.scaleway.com/en/docs/compute/functions/api-cli/fun-uploading-with-serverless-framework/)
- [Scaleway Serverless Containers Documentation](https://www.scaleway.com/en/docs/compute/containers/api-cli/cont-uploading-with-serverless-framework/)
- [Serverless Framework documentation](https://serverless.com)
- [Scaleway Serverless example projects](https://github.com/scaleway/serverless-examples)

## Contributing

This plugin is developed and maintained by the `Scaleway Serverless Team`, but we welcome pull requests and issues, and are available to chat on our [Community Slack Channels](https://scaleway-community.slack.com/): #serverless-containers and #serverless-functions.

If you are looking for a way to contribute please read [CONTRIBUTING.md](./.github/CONTRIBUTING.md). You can also look at the [development documentation](docs/development.md).

For general information about developing Serverless Framework, refer to the Serverless Framework [plugins documentation](https://www.serverless.com/framework/docs/guides/plugins/creating-plugins).

## Help & support

- Scaleway support is available on Scaleway Console.
- Additionally, you can join our [Slack Community](https://www.scaleway.com/en/docs/tutorials/scaleway-slack-community/)

## Reach Us

We love feedback. Feel free to:

- Open a [Github issue](https://github.com/scaleway/serverless-scaleway-functions/issues/new)
- Send us a message on the [Scaleway Slack community](https://slack.scaleway.com/), in the
  [#serverless-functions](https://scaleway-community.slack.com/app_redirect?channel=serverless-functions) channel.

## License

This project is MIT licensed.
