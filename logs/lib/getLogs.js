"use strict";

module.exports = {
  async getLogs() {
    const namespace = await this.getNamespaceFromList(
      this.namespaceName,
      this.provider.getScwProject(),
    );
    const apps = await this.listApplications(namespace);
    const app = this.getApplicationId(apps);
    const lines = await this.getLines(app);
    return this.printLines(lines);
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
        "Refer to our documentation here: https://www.scaleway.com/en/developers/api/serverless-containers/#logs.\n----",
    );
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      this.serverless.cli.log(logs[i].message);
    }
  },
};
