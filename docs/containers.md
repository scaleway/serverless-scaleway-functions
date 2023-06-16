# Managing containers

>**Requirements:**
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

