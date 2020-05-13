'use strict';

const BbPromise = require('bluebird');

module.exports = {

  getLogs() {
    return BbPromise.bind(this)
      .then(() => this.getNamespaceFromList(this.namespaceName))
      .then(this.listApplications).all()
      .then(this.getApplicationId)
      .then(this.getLines)
      .then(this.printLines);
  },

  listApplications(namespace) {
    return [this.listFunctions(namespace.id), this.listContainers(namespace.id)];
  },

  getApplicationId([functions, containers]) {
    const apps = functions.concat(containers);
    for (let i = 0; i < apps.length; i += 1) {
      if (apps[i].name === this.options.f) {
        return apps[i].id;
      }
    }
    throw new Error(`application "${this.options.f}" not found`);
  },

  printLines(logs) {
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      this.serverless.cli.log(logs[i].message);
    }
  },
};
