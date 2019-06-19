const BbPromise = require('bluebird');
const validate = require('../shared/validate');
const setUpDeployment = require('../shared/setUpDeployment');
const createNamespace = require('./lib/createNamespace');
const createFunctions = require('./lib/createFunctions');
const uploadCode = require('./lib/uploadCode');
const deployFunctions = require('./lib/deployFunctions');
const namespaceUtils = require('../shared/namespace');

class ScalewayDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('scaleway');

    Object.assign(
        this,
        validate,
        setUpDeployment,
        createNamespace,
        createFunctions,
        uploadCode,
        deployFunctions,
        namespaceUtils,
    );

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      'before:deploy:deploy': () => BbPromise.bind(this)
        .then(this.provider.initialize(this.serverless, this.options))
        .then(this.validate)
        .then(this.setUpDeployment),
      // Every tasks related to functions deployment:
      // - Create a namespace if it does not exist
      // - Create each functions in API if it does not exist
      // - Zip code - zip each function
      // - Get Presigned URL and Push code for each function to S3
      // - Deploy each function
      'deploy:deploy': () => BbPromise.bind(this)
          .then(this.createNamespace)
          .then(this.createFunctions)
          .then(this.uploadCode)
          .then(this.deployFunctions),
    };
  }
}

module.exports = ScalewayDeploy;
