'use strict';

const BbPromise = require('bluebird');

module.exports = {

  getLogs() {
    return BbPromise.bind(this)
      .then(() => this.getNamespaceFromList(this.namespaceName))
      .then(this.listApplications)
      .then(this.getApplicationId)
      .then(this.getLines)
      .then(this.printLines);
  },

  listApplications(namespace) {
    if (this.options.container) {
      return this.listContainers(namespace.id);
    }
    return this.listFunctions(namespace.id);
  },

  getApplicationId(apps) {
    for (let i = 0; i < apps.length; i += 1) {
      if (apps[i].name === this.options.f) {
        return apps[i].id;
      }
    }
    return this.notFoundError();
  },

  notFoundError() {
    let applicationType = 'function';
    if (this.options.container) {
      applicationType = 'container';
    }
    throw new Error(`${applicationType} "${this.options.f}" not found`);
  },

  printLines(logs) {
    for (let i = 0; i < logs.length; i += 1) {
      this.serverless.cli.log(logs[i].message);
    }
  },
};
