# Python

The `handler` for a Python function should be the path to the file, followed by the function to call. For example with a file structure like:

```yml
- src
  - handlers
  - firstHandler.py  => def my_first_handler
  - secondHandler.py => def my_second_handler
- serverless.yml
```

Your `serverless.yml` would look like:

```yml
provider:
  runtime: python310
functions:
  first:
    handler: src/handlers/firstHandler.my_first_handler
  second:
    handler: src/handlers/secondHandler.my_second_handler
```

You can find more Python examples in the [examples folder](../examples).
