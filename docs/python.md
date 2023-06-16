# Python

Path to handler file `src/testing/handler.py`:

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

