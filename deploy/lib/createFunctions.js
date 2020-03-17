'use strict';

const BbPromise = require('bluebird');

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
    const message = `this -> ${this.runtime} and func ->  ${func.runtime}`;
    this.serverless.cli.log(`${message}`)

    const params = {
      name: func.name,
      environment_variables: func.env,
      namespace_id: this.namespace.id,
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      runtime: func.runtime || this.runtime,
      timeout: func.timeout,
      handler: func.handler,
      privacy: func.privacy,
    };

    this.serverless.cli.log(`Creating function ${func.name}...`);
    return this.createFunction(params)
      .then(response => Object.assign(response, { handler: func.handler }));
  },

  updateSingleFunction(func, foundFunc) {
    const params = {};

    params.redeploy = false;
    params.environment_variables = func.env;
    params.memory_limit = func.memoryLimit;
    params.min_scale = func.minScale;
    params.max_scale = func.maxScale;
    params.timeout = func.timeout;
    params.handler = func.handler;
    params.privacy = func.privacy;

    this.serverless.cli.log(`Updating function ${func.name}...`);
    return this.updateFunction(foundFunc.id, params)
      .then(response => Object.assign(response, { handler: func.handler }));
  },
};
