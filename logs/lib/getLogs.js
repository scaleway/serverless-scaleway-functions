"use strict";

const BbPromise = require("bluebird");

module.exports = {
  getLogs() {
    return BbPromise.bind(this)
      .then(() =>
        this.getNamespaceFromList(
          this.namespaceName,
          this.provider.getScwProject()
        )
      )
      .then(this.listApplications)
      .all()
      .then(this.getApplicationId)
      .then(this.getLines)
      .then(this.printLines);
  },

  listApplications(namespace) {
    if (typeof this.listFunctions === "function") {
      return this.listFunctions(namespace.id);
    }
    return this.listContainers(namespace.id);
  },

  getApplicationId(apps) {
    for (let i = 0; i < apps.length; i += 1) {
      if (apps[i].name === this.options.function) {
        return apps[i];
      }
    }
    throw new Error(`application "${this.options.function}" not found`);
  },

  printLines(logs) {
    this.serverless.cli.log(
      '----\n⚠️ WARNING: "serverless logs" command is deprecated and will be removed on March 12, 2024. ' +
        "Please use Cockpit as soon as possible to continue browsing your logs. " +
        "Refer to our documentation here: https://www.scaleway.com/en/developers/api/serverless-containers/#logs.\n----"
    );
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      this.serverless.cli.log(logs[i].message);
    }
  },
};
