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
      .then(response => response.data.functions);
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
      environment_variables: func.env || {},
      namespace_id: this.namespace.id,
      memory_limit: func.memoryLimit || constants.DEFAULT_MEMORY_LIMIT,
      cpu_limit: func.cpuLimit || constants.DEFAULT_CPU_LIMIT,
      min_scale: func.minScale || constants.DEFAULT_MIN_SCALE,
      max_scale: func.maxScale || constants.DEFAULT_MAX_SCALE,
      runtime: this.runtime,
    };
    if (func.timeout) {
      params.timeout = func.timeout;
    }
    if (func.handler) {
      params.handler = func.handler;
    }
    this.serverless.cli.log(`Creating function ${func.name}...`);

    return this.provider.apiManager.post('functions', params)
      .then(response => Object.assign(response.data, { handler: func.handler }));
  },

  updateFunction(func, foundFunc) {
    const params = {
      environment_variables: func.env || {},
      min_scale: func.minScale || foundFunc.min_scale,
      max_scale: func.maxScale || foundFunc.max_scale,
      memory_limit: func.memoryLimit || foundFunc.memory_limit,
      cpu_limit: func.cpuLimit || foundFunc.cpu_limit,
      runtime: this.runtime,
      redeploy: false,
    };
    if (func.timeout) {
      params.timeout = func.timeout;
    }
    if (func.handler) {
      params.handler = func.handler;
    }
    const updateUrl = `functions/${foundFunc.id}`;
    this.serverless.cli.log(`Updating function ${func.name}...`);
    return this.provider.apiManager.put(updateUrl, params)
      .then(response => Object.assign(response.data, { handler: func.handler }));
  },
};
