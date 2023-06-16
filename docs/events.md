### Events

With events, you can link your functions with `CRON Schedule (Time based)` triggers.

>**Note**:
We do not include HTTP triggers in our event types, as an HTTP endpoint is created for every function. Triggers are just a new way to trigger your Function, but you can always execute your code via HTTP.

Below is a list of supported triggers on Scaleway Serverless, and the configuration parameters required to deploy them:
- **schedule**: trigger your function based on CRON schedules
  - `rate`: CRON Schedule (UNIX Format) on which your function will be executed
  - `input`: key-value mapping to define arguments that will be passed into your function's event object during execution.

You can define an `events` key in your function to link it to a trigger.

```yml
functions:
  handler: myHandler.handle
  events:
    # "events" is a list of triggers, the first key being the type of trigger.
    - schedule:
        # CRON Job Schedule (UNIX Format)
        rate: '1 * * * *'
        # Input variable are passed in your function's event during execution
        input:
          key: value
          key2: value2
```

You can link events to your containers (refer to the [Managing containers](#managing-containers) section below for more information about how to deploy containers):

```yaml
custom:
  containers:
    mycontainer:
      directory: my-directory
      # Events key
      events:
        - schedule:
            rate: '1 * * * *'
            input:
              key: value
              key2: value2
```

Refer to the following examples:
- [NodeJS with schedule trigger](./examples/nodejs-schedule)
- [Container with Schedule Trigger](./examples/container-schedule)

