# PHP

Recommended folder structure for `php` runtimes:
```yml
├── handler.php
├── composer.json (not necessary if you do not need dependencies)
└── serverless.yml
```

Your serverless.yml `functions` should look something like this:

```yml
provider:
  runtime: php82
functions:
  main:
    handler: "handler"
```

