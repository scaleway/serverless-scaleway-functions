'use strict';

const BbPromise = require('bluebird');

module.exports = {
  deployFunctions() {
    this.serverless.cli.log('Deploying Functions...');
    return BbPromise.bind(this)
      .then(this.deployEachFunction)
      .then(() => this.serverless.cli.log('Waiting for function deployments, this may take multiple minutes...'))
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
      .then(this.waitFunctionsAreDeployed);
  },

  deployEachFunction() {
    const promises = this.functions.map(
      func => this.provider.apiManager.post(`functions/${func.id}/deploy`, {})
      .then(response => response.data)
      .catch((err) => {
        throw new Error(err.response.data.message)
      }),
    );

    return Promise.all(promises);
  },

  waitFunctionsAreDeployed() {
    return this.provider.apiManager.get(`namespaces/${this.namespace.id}/functions`)
      .then((response) => {
        const functions = response.data.functions || [];
        let functionsAreReady = true;
        for (let i = 0; i < functions.length; i += 1) {
          const func = response.data.functions[i];
          if (func.status === 'error') {
            throw new Error(func.error_message)
          }
          if (func.status !== 'ready') {
            functionsAreReady = false;
            break;
          }
        }
        if (!functionsAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitFunctionsAreDeployed()), 5000);
          });
        }

        // Print every functions endpoint
        return functions.forEach(func => this.serverless.cli.log(`Function ${func.name} has been deployed to: ${func.endpoint}`));
      });
  },
};
