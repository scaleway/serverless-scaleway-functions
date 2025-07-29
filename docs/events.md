# Events

With events, you can link your functions with CRON Schedule (time-based) or NATS (message-based) triggers.

To do this you can add an `events` key in your function or container as follows:

```yml
# Function
functions:
  handler: myHandler.handle
  events:
    - schedule:
        # CRON Job Schedule (UNIX Format)
        rate: "1 * * * *"

        # Input variable are passed in your function's event during execution
        input:
          key: value
          key2: value2
    - nats:
        name: my-nats-event
        scw_nats_config:
          subject: ">"
          mnq_nats_account_id: "nats account id"
          mnq_project_id: "project id"
          mnq_region: "fr-par"
    - sqs:
        name: my-sqs-trigger
        queue: "name"
        projectId: "project-id"  # Optional
        region: "fr-par"  # Optional

# Container
custom:
  containers:
    mycontainer:
      directory: my-directory

      # Events key
      events:
        - schedule:
            rate: "1 * * * *"
            input:
              key: value
              key2: value2
```

For more information, see the following examples:

- [NodeJS with schedule trigger](../examples/nodejs-schedule)
- [Container with Schedule Trigger](../examples/container-schedule)
