# Rust

The recommended folder structure for Rust functions is:

```yml
- src
  - handler.rs
- serverless.yml
```

Your serverless.yml `functions` should look something like this:

```yml
provider:
  runtime: rust179
functions:
  main:
    handler: "handler"
```

You can find more Rust examples in the [examples folder](../examples).
