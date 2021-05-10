const BbPromise = require('bluebird');
const setUpDeployment = require('../shared/setUpDeployment');
const getLogs = require('./lib/getLogs');
const { FunctionApi } = require('../shared/api');
const { ContainerApi } = require('../shared/api');

class ScalewayLogs {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('scaleway');
    this.provider.initialize(this.serverless, this.options);
    let api;

    if (this.provider.serverless.service.function
      && Object.keys(this.provider.serverless.service.functions).length !== 0) {
      const credentials = this.provider.getFunctionCredentials();
      api = new FunctionApi(credentials.apiUrl, credentials.token);
    }

    if (this.provider.serverless.service.custom
      && this.provider.serverless.service.custom.containers
      && Object.keys(this.provider.serverless.service.custom.containers).length !== 0) {
      const credentials = this.provider.getContainerCredentials();
      api = new ContainerApi(credentials.apiUrl, credentials.token);
    }

    Object.assign(
      this,
      setUpDeployment,
      getLogs,
      api,
    );
    this.hooks = {
      'before:logs:logs': () => BbPromise.bind(this)
        .then(this.setUpDeployment),
      'logs:logs': () => BbPromise.bind(this)
        .then(this.getLogs),
    };
  }
}

module.exports = ScalewayLogs;
