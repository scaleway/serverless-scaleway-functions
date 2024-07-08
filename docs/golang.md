# Golang

For Go functions, the `handler` parameter must be the path to your handler's **package**. For example, if you have the following structure:

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
  runtime: go122
functions:
  main:
    handler: "."
  testing:
    handler: src/testing
  second:
    handler: src/second
```
