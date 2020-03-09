const BbPromise = require('bluebird');
const { Api } = require('../shared/api');
const validate = require('../shared/validate');
const setUpDeployment = require('../shared/setUpDeployment');
const createNamespace = require('./lib/createNamespace');
const createFunctions = require('./lib/createFunctions');
const createContainers = require('./lib/createContainers');
const pushContainers = require('./lib/pushContainers');
const uploadCode = require('./lib/uploadCode');
const deployFunctions = require('./lib/deployFunctions');
const deployContainers = require('./lib/deployContainers');
const deployTriggers = require('./lib/deployTriggers');

class ScalewayDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('scaleway');
    this.provider.initialize(this.serverless, this.options);

    const credentials = this.provider.getCredentials();
    const api = new Api(credentials.apiUrl, credentials.token);

    Object.assign(
      this,
      validate,
      setUpDeployment,
      createNamespace,
      createFunctions,
      createContainers,
      pushContainers,
      uploadCode,
      deployFunctions,
      deployContainers,
      deployTriggers,
      api,
    );

    function chainContainers() {
      if (this.provider.serverless.service.custom
          && this.provider.serverless.service.custom.containers
          && Object.keys(this.provider.serverless.service.custom.containers).length !== 0) {
        return this.createContainers()
          .then(this.pushContainers)
          .then(this.deployContainers);
      }
      return undefined;
    }

    function chainFunctions() {
      if (this.provider.serverless.service.functions
        && Object.keys(this.provider.serverless.service.functions).length !== 0) {
        return this.createFunctions()
          .then(this.uploadCode)
          .then(this.deployFunctions);
      }
      return undefined;
    }

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(this.setUpDeployment)
        .then(this.validate),
      // Every tasks related to functions deployment:
      // - Create a namespace if it does not exist
      // - Create each functions in API if it does not exist
      // - Zip code - zip each function
      // - Get Presigned URL and Push code for each function to S3
      // - Deploy each function / container
      'deploy:deploy': () => BbPromise.bind(this)
        .then(this.createServerlessNamespace)
        .then(chainContainers)
        .then(chainFunctions)
        .then(this.deployTriggers),
    };
  }
}

module.exports = ScalewayDeploy;
