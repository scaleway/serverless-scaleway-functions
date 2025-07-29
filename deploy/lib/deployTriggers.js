"use strict";

const BbPromise = require("bluebird");

module.exports = {
  deployTriggers() {
    this.serverless.cli.log("Deploying triggers...");
    return BbPromise.bind(this)
      .then(() => this.manageTriggers(this.functions, true))
      .then(() => this.manageTriggers(this.containers, false));
  },

  manageTriggers(applications, isFunction) {
    if (!applications || !applications.length) {
      return undefined;
    }

    // For each Functions
    const promises = applications.map((application) =>
      this.getTriggersForApplication(application, isFunction)
        .then((appWithTriggers) =>
          this.deletePreviousTriggersForApplication(appWithTriggers)
        )
        .then(() =>
          this.createNewTriggersForApplication(application, isFunction)
        )
        .then((triggers) =>
          this.printDeployedTriggersForApplication(application, triggers)
        )
    );

    return Promise.all(promises);
  },

  getTriggersForApplication(application, isFunction) {
    return this.listTriggersForApplication(application.id, isFunction).then(
      (triggers) => ({
        ...application,
        currentTriggers: [...triggers],
      })
    );
  },

  deletePreviousTriggersForApplication(application) {
    // Delete and re-create every triggers...
    const deleteTriggersPromises = application.currentTriggers.map(
      (trigger) => {
        if ("schedule" in trigger) {
          this.deleteCronTrigger(trigger.id);
        } else {
          this.deleteMessageTrigger(trigger.id);
        }
      }
    );

    return Promise.all(deleteTriggersPromises);
  },

  createNewTriggersForApplication(application, isFunction) {
    // Get application for serverless service, to get events
    let serverlessApp;
    if (isFunction) {
      serverlessApp =
        this.provider.serverless.service.functions[application.name];
    } else {
      serverlessApp =
        this.provider.serverless.service.custom.containers[application.name];
    }

    if (!serverlessApp || !serverlessApp.events) {
      return [];
    }

    const createTriggersPromises = serverlessApp.events.map((event) => {
      if ("schedule" in event) {
        this.createCronTrigger(application.id, isFunction, {
          schedule: event.schedule.rate,
          args: event.schedule.input || {},
        });
      }
      if ("nats" in event) {
        this.createMessageTrigger(application.id, {
          name: event.nats.name,
          scw_nats_config: event.nats.scw_nats_config,
        });
      }
      if ("sqs" in event) {
        this.createMessageTrigger(application.id, {
          name: event.sqs.name,
          scw_sqs_config: {
            queue: event.sqs.queue,
            mnq_project_id: event.sqs.projectId || this.provider.getScwProject(),
            mnq_region: event.sqs.region || this.provider.getScwRegion()
          }
        });
      }
    });

    return Promise.all(createTriggersPromises);
  },

  printDeployedTriggersForApplication(application, triggers) {
    triggers.forEach(() =>
      this.serverless.cli.log(
        `Deployed a new trigger for application ${application.name}`
      )
    );
    return undefined;
  },
};
