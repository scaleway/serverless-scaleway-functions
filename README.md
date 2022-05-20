# Serverless Framework: Deploy on Scaleway Functions

The Scaleway functions plugin for [Serverless Framework](https://serverless.com/) allows users to deploy their functions and containers to Scaleway Functions with a simple serverless deploy.

Serverless Framework handles everything from creating namespaces to function/code deployment by calling APIs endpoint under the hood.	

- [Serverless Framework: Deploy on Scaleway Functions](#serverless-framework-deploy-on-scaleway-functions)
  - [Requirements](#requirements)
  - [Create a Project](#create-a-project)
  - [Configure your functions](#configure-your-functions)
  - [Functions Handler](#functions-handler)
    - [Node ES Modules](#node-es-modules)
    - [Node](#node)
    - [Python](#python)
    - [Golang](#golang)
    - [Events](#events)
    - [Managing containers](#managing-containers)
  - [Logs](#logs)
  - [Documentation and useful Links](#documentation-and-useful-links)
  - [Contributing](#contributing)
  - [License](#license)

## Requirements
	
- Install node.js
- Install [Serverless](https://serverless.com) CLI (`npm install serverless -g`)

Let's work into ~/my-srvless-projects
```bash
# mkdir ~/my-srvless-projects
# cd ~/my-srvless-projects
```

## Create a Project

The easiest way to create a project is to use one of our templates. The list of templates is [here](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples)

Let's use python3

```bash
serverless create --template-url https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/python3 --path myService
```

Once it's done, we can install mandatory node packages used by serverless
```bash
cd mypython3functions
npm i
```

Note: these packages are only used by serverless, they are not shipped with your functions.

## Configure your functions

Your functions are defined in the `serverless.yml` file created:

```yml
service: scaleway-python3
configValidationMode: off

provider:
  name: scaleway
  runtime: python310
  # Global Environment variables - used in every functions
  env:
    test: test
  scwToken: <scw-token>
  scwProject: <scw-project-id>
  # region in which the deployment will happen, (default fr-par)
  scwRegion: <scw-region>

plugins:
  - serverless-scaleway-functions
  
package:
  patterns:
    - '!node_modules/**'
    - '!.gitignore'
    - '!.git/**'

functions:
  first:
    handler: handler.py
    # Local environment variables - used only in given function
    env:
      local: local
```

**Note: `provider.name` and `plugins` MUST NOT be changed, they enable us to use the scaleway provider**

This file contains the configuration of one namespace containing one or more functions (in this example, only one)
of the same runtime (here `python3`)

The different parameters are:
* `service`: your namespace name
* `provider.runtime`: the runtime of your functions (check the supported runtimes above)
* `provider.env`: environment variables attached to your namespace are injected to all your namespace functions
* `provider.secret`: secret environment variables attached to your namespace are injected to all your namespace functions, see [this example project](./examples/secrets)
* `scwToken`: Scaleway token you got in prerequisites
* `scwProject`: Scaleway org id you got in prerequisites
* `scwRegion`: Scaleway region in which the deployment will take place (default: `fr-par`)
* `package.patterns`: usually, you don't need to configure it. Enable to include/exclude directories to/from the deployment
* `functions`: Configure of your fonctions. It's a yml dictionary, with the key being the function name
  * `handler` (Required): file or function which will be executed. See the next section for runtime specific handlers
  * `env` (Optional): environment variables specific for the current function
  * `secret` (Optional): secret environment variables specific for the current function, see [this example project](./examples/secrets)
  * `minScale` (Optional): how many function instances we keep running (default: 0)
  * `maxScale` (Optional): maximum number of instances this function can scale to (default: 20)
  * `memoryLimit`: ram allocated to the function instances. See the introduction for the list of supported values
  * `timeout`: is the maximum duration in seconds that the request will wait to be served before it times out (default: 300 seconds)
  * `runtime`: (Optional) runtime of the function, if you need to deploy multiple functions with different runtimes in your Serverless Project. If absent, `provider.runtime` will be used to deploy the function, see [this example project](./examples/multiple).
  * `events` (Optional): List of events to trigger your functions (e.g, trigger a function based on a schedule with `CRONJobs`). See `events` section below

## Functions Handler

Based on the chosen runtime, the `handler` variable on function might vary.


### Node ES Modules

[Official ESM documentaton](https://nodejs.org/api/esm.html) 

ES-Modules are available from `node16` runtime @ on Scaleway Serverless Functions. 
Recent versions of Node introduce a modern way to re-use your code. By default Node treats your code with `CommonJS`.

According to the official documentation you can enable module by specifying module type in `package.json`, example :

```json
  ...
  "type": "module",
  ...
```

And then you can write down your code ESM way : 

```javascript
export {handle};

function handle (event, context, cb) {
    return {
        body: process.version,
        statusCode: 200,
    };
};
```

Note that switching from `CommonJS` to `ES-Modules` can break your code not working if you use old import style such as  `require()` function.

### Node

Path to your handler file (from serverless.yml), omit `./`, `../`, and add the exported function to use as a handler :

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
	
Path to your handler's **package**, for example if I have the following structure:
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

### Events

With `events`, you may link your functions with specific triggers, which might include `CRON Schedule (Time based)`, `MQTT Queues` (Publish on a topic will trigger the function), `S3 Object update` (Upload an object will trigger the function).

**Note that we do not include HTTP triggers in our event types, as a HTTP endpoint is created for every function**. Triggers are just a new way to trigger your Function, but you will always be able to execute your code via HTTP.

Here is a list of supported triggers on Scaleway Serverless, and the configuration parameters required to deploy them:
- **schedule**: Trigger your function based on CRON schedules
  - `rate`: CRON Schedule (UNIX Format) on which your function will be executed
  - `input`: key-value mapping to define arguments that will be passed into your function's event object during execution.

To link a Trigger to your function, you may define a key `events` in your function:
```yml
functions:
  handler: myHandler.handle
  events:
    # "events" is a list of triggers, the first key being the type of trigger.
    - schedule:
        # CRON Job Schedule (UNIX Format)
        rate: '1 * * * *'
        # Input variable are passed in your function's event during execution
        input:
          key: value
          key2: value2
```

You may link Events to your **Containers too** (See section `Managing containers` below for more informations on how to deploy containers):

```yaml
custom:
  containers:
    mycontainer:
      directory: my-directory
      # Events key
      events:
        - schedule:
            rate: '1 * * * *'
            input:
              key: value
              key2: value2
```

You may refer to the follow examples:
- [NodeJS-10 with schedule trigger](./examples/nodejs10-schedule)
- [Container with Schedule Trigger](./examples/container-schedule)

### Managing containers

**Requirements:** You need to have Docker installed to be able to build and push your image to your Scaleway registry.

You must define your containers inside the `custom.containers` field in your serverless.yml manifest.
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

Here is an example of the files you should have, the `directory` containing your Dockerfile and scripts is `my-container-directory`.

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

Scaleway's platform will automatically inject a PORT environment variable on which your server should be listening for incoming traffic. By default, this PORT is 8080. You may change the `port` in your `serverless.yml`. 

You may use the [container example](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/container) to getting started.

## Logs

The `serverless logs` command lets you watch the logs of a specific function or container.

Pass the function or container name you want to fetch the logs for with `--function`:

```bash
serverless logs --function <function_or_container_name>
```

## Documentation and useful Links

- [Official Scaleway Serverless Functions Documentation](https://www.scaleway.com/en/docs/compute/functions/api-cli/fun-uploading-with-serverless-framework/)
- [Official Scaleway Serverless Containers Documentation](https://www.scaleway.com/en/docs/compute/containers/api-cli/cont-uploading-with-serverless-framework/)
- [Scaleway Functions Golang Runtime](https://github.com/scaleway/scaleway-functions-go) (you `MUST` use this library if you plan to develop with Golang).
- [Serverless Framework documentation](https://serverless.com)
- [Scaleway Cloud Provider](https://scaleway.com)
- [Examples/Templates](https://github.com/scaleway/serverless-scaleway-functions/blob/master/examples) for different runtimes on Scaleway Functions


## Contributing

This plugin is mainly developed and maintained by `Scaleway Serverless Team` but you are free to open issues or discuss with us on our [Community Slack Channels](https://scaleway-community.slack.com/) #serverless-containers and #serverless-functions.

## License

This project is MIT licensed.
