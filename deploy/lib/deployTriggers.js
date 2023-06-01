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
    const deleteTriggersPromises = application.currentTriggers.map((trigger) =>
      this.deleteTrigger(trigger.id)
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

    const createTriggersPromises = serverlessApp.events.map((event) =>
      this.createTrigger(application.id, isFunction, {
        schedule: event.schedule.rate,
        args: event.schedule.input || {},
      })
    );

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
