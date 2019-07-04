'use strict';

const BbPromise = require('bluebird');
const constants = require('./constants');


module.exports = {
  createFunctions() {
    return BbPromise.bind(this)
      .then(this.getFunctions)
      .then(this.createOrUpdateFunctions);
  },

  getFunctions() {
    const functionsUrl = `namespaces/${this.namespace.id}/functions`;
    return this.provider.apiManager.get(functionsUrl)
      .then(response => response.data.functions)
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
  },

  createOrUpdateFunctions(foundFunctions) {
    const functions = this.provider.serverless.service.functions;

    const functionNames = Object.keys(functions);
    const promises = functionNames.map((functionName) => {
      const func = Object.assign(functions[functionName], { name: functionName });
      const foundFunc = foundFunctions.find(f => f.name === func.name);
      return foundFunc ? this.updateFunction(func, foundFunc) : this.createSingleFunction(func);
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
      namespace_id: this.namespace.id,
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      runtime: this.runtime,
      timeout: func.timeout,
      handler: func.handler
    };

    this.serverless.cli.log(`Creating function ${func.name}...`);

    return this.provider.apiManager.post('functions', params)
      .then(response => Object.assign(response.data, { handler: func.handler }))
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
  },

  updateFunction(func, foundFunc) {

    const params = {};

    params.redeploy = false;
    params.environment_variables = func.env;
    params.memory_limit = func.memoryLimit;
    params.min_scale = func.minScale;
    params.max_scale = func.maxScale;
    params.timeout = func.timeout;
    params.handler = func.handler;

    const updateUrl = `functions/${foundFunc.id}`;
    this.serverless.cli.log(`Updating function ${func.name}...`);
    return this.provider.apiManager.patch(updateUrl, params)
      .then(response => Object.assign(response.data, { handler: func.handler }))
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
  },
};
