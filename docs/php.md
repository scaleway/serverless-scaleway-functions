# PHP

The Recommended folder structure for `php` functions is as follows:

```yml
├── handler.php
├── composer.json (not necessary if you do not need dependencies)
└── serverless.yml
```

Your `serverless.yml` can then look something like this:

```yml
provider:
  runtime: php82
functions:
  main:
    handler: "handler"
```

You can find more PHP examples in the [examples folder](../examples).
