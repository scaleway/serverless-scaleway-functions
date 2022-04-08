# Serverless Framework with Scaleway Functions

This is a guide on how to `get started` using Scaleway Functions with Serverless framework.

- [Serverless Framework with Scaleway Functions](#serverless-framework-with-scaleway-functions)
  - [Requirements](#requirements)
- [Serverless Deploy - Deploy a FaaS Project](#serverless-deploy---deploy-a-faas-project)
  - [Create a Project](#create-a-project)
  - [Authenticate to Scaleway](#authenticate-to-scaleway)
    - [Retrieve Scaleway Credentials](#retrieve-scaleway-credentials)
    - [Use your credentials](#use-your-credentials)
  - [Managing resources](#managing-resources)
    - [Managing Namespace (Project)](#managing-namespace-project)
    - [Managing functions](#managing-functions)
    - [Managing containers](#managing-containers)
    - [Runtime and Functions Handler](#runtime-and-functions-handler)
    - [Runtimes](#runtimes)
      - [Functions Handler](#functions-handler)
    - [Environment Variables](#environment-variables)
- [Serverless Remove: Delete a project](#serverless-remove-delete-a-project)

## Requirements

In order to start development on this plugin, you will have to run through multiple steps:
- Install node.js
- Install [Serverless](https://serverless.com) CLI
- Clone this repository locally

# Serverless Deploy - Deploy a FaaS Project

## Create a Project

**Make sure** that you cloned/downloaded this repository locally.

Some template examples are available [inside this plugin's examples directory](../examples) (More informations about available templates/examples [in this page of the documentation](./templates.md)), you may create a project boilerplate from one of these templates with the following command:


**Important**: template-path *MUST* be absolute

```
serverless create --template-path=~/my-srvless-projects/serverless-scaleway-functions/examples/{template} --path=my-function
```

## Authenticate to Scaleway

Scaleway's Serverless plugin requires access to Scaleway resources for your account in order to properly manage spaces and functions.

### Retrieve Scaleway Credentials

You will need to provide both `project ID` and `secret key`. You may retrieve these inside the [console's credentials page](https://console.scaleway.com/account/credentials):

- Login/Register to [Scaleway console](https://console.scaleway.com)
- Go to your [credentials management page](https://console.scaleway.com/account/credentials)
- Retrieve your `project ID` and generate a token (see following picture):
![credentials section](./assets/credentials_section.png)
- Retrieve lastly created token's `secret key`:
![token secret key](./assets/secret_key.png)

Now, when running `serverless` commands from your project directory, serverless CLI will use scaleway plugin to execute commands.

### Use your credentials

Once you retrieved your `project ID` and created a new `token`, you will have to use these credentiasl with the Serverless Framework.

There are multiple ways to do it:

- **serverless.yml** manifest. Inside your manifest, you may inquire your credentials with the following structure under the `provider` key:
```yml
provider:
  scwToken: <scw-token>
  scwProject: <scw-project-id>
```
- **CLI arguments**:

[link to CLI documentation](https://github.com/scaleway/scaleway-cli/blob/master/docs/commands/function.md)

- **Environment variables**:
```bash
export SCW_TOKEN=<scw-token>
export SCW_PROJECT=<scw-project-id>
serverless deploy
```

The priority order is the following (from top: + priority to bottom: - priority):
- CLI
- Environment variables
- serverless.yml
- scwToken and scwProject variables

## Managing resources

You may want to update `serverless.yml manifest` file in order to manage functions your Scaleway Functions.

**Note** that in order to use Scaleway Functions plugin, you will need to use the following statement inside your `serverless.yml` file:
```yml
plugins:
  - serverless-scaleway-functions
```

### Managing Namespace (Project)

```yml
service:
  # Name of the namespace to manage on your Scaleway Account, basically your project name
  name: <namespace-name>

provider:
  name: scaleway
  # Runtimes are listed in documentation
  # You don't need to specify a runtime if you deploy only containers
  # This is the default runtime for your functions
  # You can define a specific runtime for each function
  runtime: <runtime>
  # See documentation below for environment
  env:
    test: test
  # See documentation in Credentials Section
  scwToken: <scw-token>
  scwProject: <scw-project-id>
```

### Managing functions

```yml
functions:
  myFunction:
    # handler may vary for each runtimes (e.g in golang, references package while python/node references handler file).    
    handler: path/to/handler/file
    # Optional runtime if same as the default runtime
    runtime: <runtime> 
    # Environment only available in this function
    env:
      MY_VARIABLE: "my-value"
```
### Managing containers

**Requirements:** You need to have Docker installed to be able to build and push your image to your Scaleway registry.

You must define your containers inside the `custom.containers` field in your serverless.yml manifest.
Each container must specify the relative path of its application directory (containing the Dockerfile, and all files related to the application to deploy):

```yml
custom:
  containers:
    myContainer:
      directory: my-container-directory
      # Environment only available in this function
      env:
        MY_VARIABLE: "my-value"
```

Here is an example of the files you should have, the `directory` containing your Dockerfile ans scripts is `my-container-directory`.

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

Scaleway's platform will automatically inject a PORT environment variable on which your server should be listening for incoming traffic. By default, this PORT is 8080.

You may use the [container example](../examples/container) to getting started.

### Runtime and Functions Handler

You must specify a default function'runtime inside `provider.runtime` key inside your serverless.yml file.  

If you want to use a different runtime for a specific function, you may define the runtime you wish to use inside functions.myfunction.runtime. This way, you may use the same serverless project to deploy functions written in different languages.

It is not necessary if you wish to deploy containers only.

### Runtimes

Available runtimes are:
- `node10`, `node14`, `node16`, `node17` for JavaScript
- `python37`, `python38`, `python39`, `python310`
- `go113`, `go117`, `go118`

#### Functions Handler

Based on the chosen runtime, the `handler` variable on function might vary:
- `node` : Path to your handler file (from serverless.yml), omit `./`, `../`, suffixed by the exported function to use (example: `myFunction.handle` => file `myFunction.js` exports a function `handle`).
  ```
  - src
    - handlers
      - firstHandler.js  => module.exports.myFirstHandler
      - secondHandler.js => module.exports.mySecondHandler
  - serverless.yml
  ```
  Inside serverless.yml:
  ```yml
  provider:
    # ...
    runtime: node16 # or node10, node16, node17
  functions:
    first:
      handler: src/handlers/firstHandler.myFirstHandler
    second:
      handler: src/handlers/secondHandler.mySecondHandler
  ```
- `python3X`: Similar to `node`, path to handler file, suffixed with exported function to use: `src/testing/handler.handle` => file `handler.py` defines a method `handle`, inside directory `src/testing`.
  ```
  - src
    - handlers
      - firstHandler.py  => def my_first_handler
      - secondHandler.py => def my_second_handler
  - serverless.yml
  ```
  Inside serverless.yml:
  ```yml
  provider:
    # ...
    runtime: python310
  functions:
    first:
      handler: src/handlers/firstHandler.my_first_handler
    second:
      handler: src/handlers/secondHandler.my_second_handler
  ```
- `golang`: Path to your handler's **package**, for example if I have the following structure:
  ```
  - src
    - testing
      - handler.go -> package main inside "src/testing" directory
    - second
      - handler.go -> package main inside "src/second" directory
  - handler.go -> package main at the root of the project
  - serverless.yml
  ```
  Your serverless.yml `functions` should look something like this:
  ```yml
  provider:
    # ...
    runtime: go118
  functions:
    root:
      handler: "."
    testing:
      handler: src/testing
    second:
      handler: src/second
  ```

After you deployed them with `serverless deploy`, you can do `serverless jwt` to get the JWT tokens for your namespace and private functions / containers.

### Environment Variables

You may inject environment variables in different scope:
- `namespace`, environment variables will be mounted in every functions of the namespace
- `function`, environment variables will only be mounted to given function.

**Note** that variables written inside functions scope will override variables from namespace (if multiple variables with the same name are inquired in both namespace and function).

```yml
provider:
  # Global env -> mounted in every functions
  env:
    GLOBAL_VARIABLE: mounted-everywhere

functions:
  myFunction:
    handler: handler.js
    # Local env -> Only mounted inside function myFunction
    env:
      LOCAL_VARIABLE: mounted-in-this-function
```


# Serverless Remove: Delete a project

To remove a project, you may run the following command:

```bash
serverless remove
```

This will remove all your functions, as well as your Scaleway Functions namespace.

**Please Note** that your Scaleway Container Registry namespace will not be removed, you will have to delete it manually either via Scaleway console, or Scaleway container registry's API.
