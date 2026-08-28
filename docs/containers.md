# Managing containers

To manage your containers, you can define them in the `custom.containers` field in your `serverless.yml` configuration file.

Each container must specify the relative path to its directory, which contains the Dockerfile, and all files related to the application:

```yml
custom:
  containers:
    mycontainer:
      directory: my-container-directory
      buildArgs:
        MY_BUILD_ARG: "my-value"
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

Unless every container specifies its own `registryImage` (see below), this plugin
automatically creates a Container Registry namespace to push built images to, matching
your service's name. If that name is already taken by another Scaleway organization
(registry namespace names are unique region-wide, unlike most other resource names in
this plugin), a project-specific suffix is appended instead - this only happens on the
very first deploy that needs one, and the same namespace is reused on every later
deploy.

Serverless Containers automatically have a `PORT` environment variable set, which indicates which port the container's webserver should be listening on. By default `PORT` is 8080. You can change this via the `port` variable in your container definition.

See the [container example](https://github.com/scaleway/serverless-scaleway-functions/tree/master/examples/container) for more information.
