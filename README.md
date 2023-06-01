# Scaleway Plugin for Serverless Framework

This is the [Scaleway Functions](https://www.scaleway.com/en/serverless-functions/) plugin for [Serverless Framework](https://serverless.com/).

> **Requirements**:

- You have installed the [Serverless Framework](https://www.serverless.com/framework/docs/getting-started).
- You have an account and are logged into the [Scaleway console](https://console.scaleway.com)
- If you have [activated IAM](/identity-and-access-management/iam/how-to/activate-iam), you may need certain [IAM permissions](/identity-and-access-management/iam/concepts/#permission) to carry out some actions described on this page. This means:
  - you are the [Owner](/identity-and-access-management/iam/concepts/#owner) of the Scaleway [Organization](/identity-and-access-management/iam/concepts/#organization) in which the actions will be carried out, or
  - you are an IAM user of the Organization, with a [policy](/identity-and-access-management/iam/concepts/#policy) granting you the necessary [permission sets](/identity-and-access-management/iam/reference-content/permission-sets/)
- You have generated an [API key](https://www.scaleway.com/en/docs/console/my-project/how-to/generate-api-key/).
- You have set up the [Scaleway CLI](https://www.scaleway.com/en/cli/).
- You have installed `node.js` on your local computer
- You have installed the [Serverless](https://serverless.com) CLI on your local computer (to do so, run `npm install serverless -g` in a terminal).

## Quickstart

1. Export the template you wish to use. You can find the available templates on [this page](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples).

```shell
export TEMPLATE=python3
```

2. Create the function.

```shell
serverless create --path my-func --template-url https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/${TEMPLATE}
```

3. Install dependencies.

```shell
cd my-func
npm i
```

4. Deploy the function. The URL is returned.

```shell
serverless deploy
```

5. Invoke the function.

```shell
serverless invoke --function first
```

## Contents

Serverless Framework handles everything from creating namespaces to function/code deployment by calling API endpoints under the hood.

- [Scaleway Plugin for Serverless Framework](#scaleway-plugin-for-serverless-framework)
  - [Quickstart](#quickstart)
  - [Contents](#contents)
  - [Create a Project](#create-a-project)
  - [Configure your functions](#configure-your-functions)
    - [Parameters](#parameters)
    - [Security and secret management](#security-and-secret-management)
  - [Functions Handler](#functions-handler)
    - [Using ES Modules](#using-es-modules)
    - [Node](#node)
    - [Python](#python)
    - [Golang](#golang)
    - [PHP](#php)
    - [Rust](#rust)
    - [Events](#events)
    - [Custom domains](#custom-domains)
    - [Deployment methods](#deployment-methods)
    - [Local testing](#local-testing)
    - [Managing containers](#managing-containers)
  - [Logs](#logs)
  - [Info](#info)
  - [Documentation and useful links](#documentation-and-useful-links)
  - [Contributing](#contributing)
  - [License](#license)

## Create a Project

The easiest way to create a new project is to use one of our templates. The list of templates is available [on this page](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples).

1. Create and change into a new directory. In this tutorial we will use `~/my-srvless-projects`.

```bash
# mkdir ~/my-srvless-projects
# cd ~/my-srvless-projects
```

2. Create a new project using `python3`.

```bash
serverless create --template-url https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/python3 --path myService
```

3. Install mandatory the following node packages, used by serverless.

```bash
cd mypython3functions
npm i
```

> **Note:**
> These packages are only used by serverless, they are not shipped with your functions.

## Configure your functions

Your functions are defined within the `serverless.yml` file. It contains the configuration of a namespace containing one or more functions (in the following example we use 1 function) of the same runtime (here `python3`).

Create the `serverless.yml` file using a text editor of your choice.

> **Important**:
> `provider.name` and `plugins` MUST NOT be changed, as they enable us to use the Scaleway provider.

```yml
service: scaleway-python3
configValidationMode: off

useDotenv: true

provider:
  name: scaleway
  runtime: python310
  # Global Environment variables - used in every functions
  env:
    test: test
  # Storing credentials in this file is strongly not recommanded for security concerns, please refer to README.md about best practices
  scwToken: <scw-token>
  scwProject: <scw-project-id>
  # region in which the deployment will happen (default: fr-par)
  scwRegion: <scw-region>

plugins:
  - serverless-scaleway-functions

package:
  patterns:
    - "!node_modules/**"
    - "!.gitignore"
    - "!.git/**"

functions:
  first:
    handler: handler.py
    # Local environment variables - used only in given function
    env:
      local: local
```

### Parameters

The configuration includes the following parameters:

- `service`: your namespace name
- `useDotenv`: load environment variables from `.env` files (default: false), read [Security and secret management](#security-and-secret-management)
- `configValidationMode`: Configuration validation: 'error' (fatal error), 'warn' (logged to the output) or 'off' (default: warn)
- `provider.runtime`: the runtime of your functions (check the supported runtimes above)
- `provider.env`: environment variables attached to your namespace are injected to all your namespace functions
- `provider.secret`: secret environment variables attached to your namespace are injected to all your namespace functions, see [this example project](./examples/secrets)
- `scwToken`: the access key (token) you generated with your API key
- `scwProject`: the Organization ID of your Scaleway Organization
- `scwRegion`: the Scaleway region in which the deployment will take place (default: `fr-par`)
- `package.patterns`: you can leave this parameter at default, or enable it to include/exclude directories to/from the deployment
- `functions`: configuration of your functions. It is a `.yml` dictionary, and the key is the function name
  - `handler` (Required): file or function which will be executed. See the next section for runtime specific handlers
  - `registryImage` (Containers only, Optional): name of the registry image. If no registry image is provided, the image will be build locally using the Dockerfile.
  - `env` (Optional): environment variables specific to the current function
  - `secret` (Optional): secret environment variables specific to the current function, see [this example project](./examples/secrets)
  - `minScale` (Optional): how many function instances we keep running (default: 0)
  - `maxScale` (Optional): maximum number of instances this function can scale to (default: 20)
  - `maxConcurrency` (Containers only, Optional): Concurrency defines the number of simultaneous requests your container can handle at the same time (default: 50)
  - `memoryLimit`: RAM allocated to the function instances. See the introduction for the list of supported values. For containers, please check valid memory limits [here](https://www.scaleway.com/en/docs/serverless/containers/reference-content/containers-limitations/).
  - `cpuLimit`: (Containers only) CPU allocated to the container instances. Please check valid CPU limits [here](https://www.scaleway.com/en/docs/serverless/containers/reference-content/containers-limitations/).
  - `timeout`: is the maximum duration in seconds that the request will wait to be served before it times out (default: 300 seconds)
  - `runtime`: (Optional) runtime of the function, if you need to deploy multiple functions with different runtimes in your Serverless Project. If absent, `provider.runtime` will be used to deploy the function, see [this example project](./examples/multiple).
  - `events` (Optional): List of events to trigger your functions (e.g, trigger a function based on a schedule with `CRONJobs`). See `events` section below
  - `custom_domains` (Optional): List of custom domains, refer to the [how to add a custom domain](https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/) documentation page
  - `httpOption` (Optional): force https redirection, possible values are `enabled` and `redirected` (default: `enabled`)
  - `privacy` (Optional): defines whether a function may be executed anonymously (`public`) or only via an authentication mechanism (`private`) (default: `public`)

### Security and secret management

> **Important**:
> We recommend you to not commit in a Version Control System (VCS), and to not share your Project ID or access key to ensure the security of your configuration file, which may contain sensitive data.

To keep your information safe and to share or commit your `serverless.yml` file you should remove your credentials from the file. Once you have done so, you can either:

- use global environment variables, or
- use `.env` file and keep it secret

To use the `.env` file you can modify your `serverless.yml` file as following:

```yml
# This will allow the plugin to read your .env file
useDotenv: true

provider:
  name: scaleway
  runtime: node16

  scwToken: ${env:SCW_SECRET_KEY}
  scwProject: ${env:SCW_DEFAULT_PROJECT_ID}
  scwRegion: ${env:SCW_REGION}
```

And then create a `.env` file next to your `serverless.yml` file, containing following values:

```bash
SCW_SECRET_KEY=XXX
SCW_DEFAULT_PROJECT_ID=XXX
SCW_REGION=fr-par
```

You can use this pattern to hide your secrets (for example, a connexion string to a Managed Database or an Object Storage bucket).

## Functions Handler

Based on the chosen runtime, the `handler` variable on function might vary.

### Using ES Modules

Node has two module systems: `CommonJS` modules and `ECMAScript` (`ES`) modules. By default, Node treats your code files as CommonJS modules, however [ES modules](https://nodejs.org/api/esm.html) have also been available since the release of `node16` runtime on Scaleway Serverless Functions. ES modules give you a more modern way to re-use your code.

According to the official documentation, to use ES modules you can specify the module type in `package.json`, as in the following example:

```json
  ...
  "type": "module",
  ...
```

This then enables you to write your code for ES modules:

```javascript
export { handle };

function handle(event, context, cb) {
  return {
    body: process.version,
    headers: { "Content-Type": ["text/plain"] },
    statusCode: 200,
  };
}
```

The use of ES modules is encouraged since they are more efficient and make setup and debugging much easier.

Note that using `"type": "module"` or `"type": "commonjs"` in your `package.json` file will enable or disable some features in Node runtime, such as:

- `commonjs` is used as the default value
- `commonjs` allows you to use `require/module.exports` (synchronous code loading - it basically copies all file contents)
- `module` allows you to use `import/export` ES6 instructions (asynchronous loading - more optimized as it imports only the pieces of code you need)

> **Tip**:
> For a comprehensive list of differences, please refer to the [Node.js official documentation](https://nodejs.org/api/esm.html).

### Node

Path to your handler file (from `serverless.yml`), omit `./`, `../`, and add the exported function to use as a handler:

```yml
- src
  - handlers
  - firstHandler.js  => module.exports.myFirstHandler = ...
  - secondHandler.js => module.exports.mySecondHandler = ...
- serverless.yml
```

In serverless.yml:

```yml
provider:
  # ...
  runtime: node16
functions:
  first:
    handler: src/handlers/firstHandler.myFirstHandler
  second:
    handler: src/handlers/secondHandler.mySecondHandler
```

Note: if you wish to use Typescript, you can do so by transpiling your code locally before deploying it. An example is
available [here](examples/typescript).

### Python

Similar to `node`, path to handler file `src/testing/handler.py`:

```yml
- src
  - handlers
  - firstHandler.py  => def my_first_handler
  - secondHandler.py => def my_second_handler
- serverless.yml
```

In serverless.yml:

```yml
provider:
  # ...
  runtime: python310 # or python37, python38, python39
functions:
  first:
    handler: src/handlers/firstHandler.my_first_handler
  second:
    handler: src/handlers/secondHandler.my_second_handler
```

### Golang

Path to your handler's **package**. For example, if you have the following structure:

```yml
- src
  - testing
  - handler.go -> package main in src/testing subdirectory
  - second
  - handler.go -> package main in src/second subdirectory
- serverless.yml
- handler.go -> package main at the root of project
```

Your serverless.yml `functions` should look something like this:

```yml
provider:
  # ...
  runtime: go118
functions:
  main:
    handler: "."
  testing:
    handler: src/testing
  second:
    handler: src/second
```

### PHP

Recommended folder structure for `php` runtimes:

```yml
├── handler.php
├── composer.json (not necessary if you do not need dependencies)
└── serverless.yml
```

Your serverless.yml `functions` should look something like this:

```yml
provider:
  runtime: php82
functions:
  main:
    handler: "handler"
```

### Rust

Recommended folder structure for `rust` runtimes:

```yml
- src
  - handler.rs (with async handler function)
- serverless.yml
```

Your serverless.yml `functions` should look something like this:

```yml
provider:
  runtime: rust165
functions:
  main:
    handler: "handler"
```

### Events

With events, you can link your functions with `CRON Schedule (Time based)` triggers.

> **Note**:
> We do not include HTTP triggers in our event types, as an HTTP endpoint is created for every function. Triggers are just a new way to trigger your Function, but you can always execute your code via HTTP.

Below is a list of supported triggers on Scaleway Serverless, and the configuration parameters required to deploy them:

- **schedule**: trigger your function based on CRON schedules
  - `rate`: CRON Schedule (UNIX Format) on which your function will be executed
  - `input`: key-value mapping to define arguments that will be passed into your function's event object during execution.

You can define an `events` key in your function to link it to a trigger.

```yml
functions:
  handler: myHandler.handle
  events:
    # "events" is a list of triggers, the first key being the type of trigger.
    - schedule:
        # CRON Job Schedule (UNIX Format)
        rate: "1 * * * *"
        # Input variable are passed in your function's event during execution
        input:
          key: value
          key2: value2
```

You can link events to your containers (refer to the [Managing containers](#managing-containers) section below for more information about how to deploy containers):

```yaml
custom:
  containers:
    mycontainer:
      directory: my-directory
      # Events key
      events:
        - schedule:
            rate: "1 * * * *"
            input:
              key: value
              key2: value2
```

Refer to the following examples:

- [NodeJS with schedule trigger](./examples/nodejs-schedule)
- [Container with Schedule Trigger](./examples/container-schedule)

### Custom domains

Custom domains allow users to use their own domains.

> **Note**:
> Refer to [custom domains on functions](https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/) or
> [custom domains on containers](https://www.scaleway.com/en/docs/compute/containers/how-to/add-a-custom-domain-to-a-container/) for more information about domain configuration.

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

- > **Note**:
  > Your domain must have a record pointing to your function hostname. You should deploy your function once to read its hostname. The configuration of custom domains becomes available after the first deploy.

- > **Note:**
  > Serverless Framework considers the configuration file as the source of truth.

- > **Important**:
  > If you create a domain with other tools (the Scaleway console, the CLI or APIs) you must refer the created domain into your serverless configuration file. Otherwise it will be deleted as serverless framework will give the priority to its configuration.

### Deployment methods

At Scaleway, there are multiple ways to create Serverless Functions and Serverless Containers. These include: the CLI, APIs, the Scaleway console, Serverless Framework and Terraform.

The `serverless deploy` command applies the configuration located in your `serverless.yml` and removes functions that are not in the file to ensure a single source of truth.

This can be controlled using the `singleSource` option. By default its value is `false`.

If `singleSource` is set to `true`, functions and containers not defined in your serverless configuration file will be removed the next time you run the `serverless deploy` command.

### Local testing

`serverless invoke local` is **not supported** directly but instead we provide additional packages to install close to your handler.

Documentation is available through runtimes frameworks for :

- [Go](https://github.com/scaleway/serverless-functions-go)
- [Python](https://github.com/scaleway/serverless-functions-python)
- [Node](https://github.com/scaleway/serverless-functions-node)

### Managing containers

> **Requirements:**

- You have [created a Container Registry namespace](https://www.scaleway.com/en/docs/compute/container-registry/how-to/create-namespace/)
- You have installed Docker and can build and push your image to your registry.

To manage your containers, you must first define them in the `custom.containers` field in your `serverless.yml` configuration file.

Each container must specify the relative path of its application directory (containing the Dockerfile, and all files related to the application to deploy):

```yml
custom:
  containers:
    mycontainer:
      directory: my-container-directory
      # port: 8080
      # Environment only available in this container
      env:
        MY_VARIABLE: "my-value"
```

Below is an example of the files you should have in your application directory. The directory that contains your Dockerfile and scripts is called `my-container-directory`.

```
.
├── my-container-directory
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── server.py
│   └── (...)
├── node_modules
│   ├── serverless-scaleway-functions
│   └── (...)
├── package-lock.json
├── package.json
└── serverless.yml
```

Scaleway's platform will automatically inject a PORT environment variable on which your server should be listening for incoming traffic. By default, this PORT is 8080. You can change the `port` in the `serverless.yml` file.

You can use the container example provided on this [documentation page](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/container) to get started.

## Logs

The `serverless logs` command lets you watch the logs of a specific function or container.

You can fetch the logs of a specific function for with the `--function` option. You must specify the name of your function in the command.

```bash
serverless logs --function <function_or_container_name>
```

## Info

The `serverless info` command gives you information about your functions' or containers' current deployement state in JSON format.

## Documentation and useful links

- [Official Scaleway Serverless Functions Documentation](https://www.scaleway.com/en/docs/compute/functions/api-cli/fun-uploading-with-serverless-framework/)
- [Official Scaleway Serverless Containers Documentation](https://www.scaleway.com/en/docs/compute/containers/api-cli/cont-uploading-with-serverless-framework/)
- [Serverless Framework documentation](https://serverless.com)
- [Scaleway Cloud Provider](https://scaleway.com)
- [Scaleway Serverless sample projects](https://github.com/scaleway/serverless-examples)

## Troubleshooting

### Rate Limiting Issue

If you are experiencing rate limiting issues (error 429) in your application, consider engaging with the support and/or the community. When seeking assistance, remember to provide relevant details, such as the specific rate limiting error messages, the affected components, and any relevant configuration information. This will enable us to better understand your situation and provide appropriate guidance or solutions.

## Contributing

This plugin is developed and maintained by the `Scaleway Serverless Team`, but we welcome pull requests and issues, and
are available to chat on our [Community Slack Channels](https://scaleway-community.slack.com/): #serverless-containers
and #serverless-functions.

If you are looking for a way to contribute please read [CONTRIBUTING.md](./.github/CONTRIBUTING.md).

For general information about developing Serverless Framework, refer to the Serverless Framework [plugins documentation](https://www.serverless.com/framework/docs/guides/plugins/creating-plugins).

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

## Help & support

- Scaleway support is available on Scaleway Console.
- Additionally, you can join our [Slack Community](https://www.scaleway.com/en/docs/tutorials/scaleway-slack-community/)

## Reach Us

We love feedback. Feel free to:

- Open a [Github issue](https://github.com/scaleway/serverless-functions-node/issues/new)
- Send us a message on the [Scaleway Slack community](https://slack.scaleway.com/), in the
  [#serverless-functions](https://scaleway-community.slack.com/app_redirect?channel=serverless-functions) channel.

## License

This project is MIT licensed.
