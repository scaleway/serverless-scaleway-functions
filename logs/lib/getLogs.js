'use strict';

const BbPromise = require('bluebird');

module.exports = {

  getLogs() {
    return BbPromise.bind(this)
      .then(() => this.getNamespaceFromList(this.namespaceName))
      .then((namespace) => this.listFunctions(namespace.id))
      .then(this.getApplicationId)
      .then(this.getLines)
      .then(this.printLines)
  },

  getApplicationId(functions){
    for (const fn of functions) {
        if (fn.name == this.options.f) {
            return fn.id
        }
    }
    throw new Error("function not found");
  },

  printLines(logs){
      for (const log of logs){
        this.serverless.cli.log(log.message)
      }
  }
};