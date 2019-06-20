# Serverless Framework: Deploy on Scaleway Functions (plugin)

Developed and maintained by `Scaleway's Serverless Team`.

This plugin allows [Serverless Framework](https://serverless.com)'s users to deploy their functions to Scaleway Functions. By using this plugin, users may deploy a fully managed Serverless Application on Scaleway Functions with just one Command Line, and a little bit of configuration.

`Scaleway Functions` is a Serverless (Function As A Service) Platform, provided by [Scaleway](https://scaleway.com) to allow end-users to develop and deploy serverless workloads (we manage your Ops, scalability, availability, while you pay only for your usage, when your code gets executed) on Scaleway's fully managed infrastructure.

The [Serverless Framework](https://serverless.com) is an Open-Source tool developed in node.js which helps you deploy a `Serverless` Project (composed of one or multiple functions) to the actor of your choice (AWS, Google Cloud, Microsoft Azure, Scaleway and more) with a single command line: `serverless deploy`.

This tool manages the different steps needed to create, package and deploy your functions to your provider thanks to `plugins`, like the one developed in this repository.

With the Serverless Framework, you define all the resources needed for your project (S3 Bucket, Database Instances and more) inside a configuration file called the `serverless.yml`, and Serverless will take care of creating these resources for you. This allows developers to focus on development of their products, while infrastructure is managed by both Serverless Framework and Cloud Providers.

## Requirements

- node.js and npm installed
- [Serverless framework](https://serverless.com) installed:
  ```bash
  npm i -g serverless
  ```
- Your are invited to the Early Access on [Scaleway Functions Platform](https://scaleway.com/betas#serverless)

## Install

```bash
npm install --save serverless-scaleway-functions
```

And inside your `serverless.yml` manifest:
```yml
plugins:
  - serverless-scaleway-functions
```

## Usage

See [this section of the documention](https://github.com/scaleway/serverless-scaleway-functions/blob/master/docs/README.md) in order to start using `Serverless with Scaleway Functions`.


## Documentation and useful Links

- [Get started with Serverless Framework on Scaleway Functions](https://github.com/scaleway/serverless-scaleway-functions/blob/master/docs/README.md)
- [Scaleway Functions Golang Runtime](https://github.com/scaleway/scaleway-functions-go) (you `MUST` use this library if you plan to develop with Golang).
- [Serverless Framework documentation](https://serverless.com)
- [Scaleway Cloud Provider](https://scaleway.com)
- [Examples/Templates](https://github.com/scaleway/serverless-scaleway-functions/blob/master/examples) for different runtimes on Scaleway Functions

As `Scaleway Functions` is only in `early phase`, the platform's documentation is private and will be linked to users invited to test the product.

We will obviously keep this plugin up-to-date based on the platform's development.

## Contributing

As said above, we are only in `early access phase`, so this plugin is mainly developed and maintained by `Scaleway Serverless Team`. When the platform will reach a stable release, contributions via Pull Requests will be open.

Until then, you are free to open issues or discuss with us on our [Community Slack Channels](https://slack.online.net/).

## License

This project is MIT licensed.
