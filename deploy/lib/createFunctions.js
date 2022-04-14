'use strict';

const BbPromise = require('bluebird');
const secrets = require('../../shared/secrets');

module.exports = {
  createFunctions() {
    return BbPromise.bind(this)
      .then(() => this.listFunctions(this.namespace.id))
      .then(this.createOrUpdateFunctions);
  },

  createOrUpdateFunctions(foundFunctions) {
    const { functions } = this.provider.serverless.service;

    const functionNames = Object.keys(functions);
    const promises = functionNames.map((functionName) => {
      const func = Object.assign(functions[functionName], { name: functionName });
      const foundFunc = foundFunctions.find(f => f.name === func.name);
      return foundFunc
        ? this.updateSingleFunction(func, foundFunc)
        : this.createSingleFunction(func);
    });

    return Promise.all(promises)
      .then((updatedFunctions) => {
        this.functions = updatedFunctions;
      });
  },

  createSingleFunction(func) {
    const params = {
      name: func.name,
      environment_variables: func.env,
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        func.secret,
      ),
      namespace_id: this.namespace.id,
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      runtime: func.runtime || this.runtime,
      timeout: func.timeout,
      handler: func.handler,
      privacy: func.privacy,
      domain_name: func.domain_name,
    };

    this.serverless.cli.log(`Creating function ${func.name}...`);
    return this.createFunction(params)
      .then(response => Object.assign(response, { handler: func.handler }));
  },

  async updateSingleFunction(func, foundFunc) {
    const params = {
      redeploy: false,
      environment_variables: func.env,
      secret_environment_variables: await secrets.mergeSecretEnvVars(
        foundFunc.secret_environment_variables,
        secrets.convertObjectToModelSecretsArray(func.secret),
      ),
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      timeout: func.timeout,
      handler: func.handler,
      privacy: func.privacy,
      domain_name: func.domain_name,
    };

    this.serverless.cli.log(`Updating function ${func.name}...`);
    return this.updateFunction(foundFunc.id, params)
      .then(response => Object.assign(response, { handler: func.handler }));
  },
};
