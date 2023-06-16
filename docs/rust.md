# Rust

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

