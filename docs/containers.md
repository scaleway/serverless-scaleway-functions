# Managing containers

To manage your containers, you can define them in the `custom.containers` field in your `serverless.yml` configuration file.

Each container must specify the relative path to its directory, which contains the Dockerfile, and all files related to the application:

```yml
custom:
  containers:
    mycontainer:
      directory: my-container-directory
      env:
        MY_VARIABLE: "my-value"
```

Below is an example of a project structure corresponding to the example above, crucially the `my-container-directory` contains all the files necessary for the container build.

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

Serverless Containers automatically have a `PORT` environment variable set, which indicates which port the container's webserver should be listening on. By default `PORT` is 8080. You can change this via the `port` variable in your container definition.

See the [container example](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/container) for more information.
