const BbPromise = require('bluebird');
const setUpDeployment = require('../shared/setUpDeployment');
const removeNamespace = require('./lib/removeNamespace');
const { FunctionApi } = require('../shared/api');
const { ContainerApi } = require('../shared/api');
const validate = require('../shared/validate');

class ScalewayDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('scaleway');
    this.provider.initialize(this.serverless, this.options);
    let api;

    if (this.provider.serverless.service.functions
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
      removeNamespace,
      validate,
      api,
    );


    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      'before:remove:remove': () => BbPromise.bind(this)
        .then(this.setUpDeployment)
        .then(this.validate),
      // Every tasks related to space deletion:
      // - Delete given space if it exists
      'remove:remove': () => BbPromise.bind(this)
        .then(this.removeNamespace),
    };
  }
}

module.exports = ScalewayDeploy;
