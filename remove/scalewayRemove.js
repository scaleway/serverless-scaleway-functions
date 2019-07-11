const BbPromise = require('bluebird');
const setUpDeployment = require('../shared/setUpDeployment');
const removeNamespace = require('./lib/removeNamespace');
const namespaceUtils = require('../shared/namespace');
const validate = require('../shared/validate');

class ScalewayDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('scaleway');

    Object.assign(
      this,
      setUpDeployment,
      removeNamespace,
      namespaceUtils,
      validate,
    );

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      'before:remove:remove': () => BbPromise.bind(this)
        .then(this.provider.initialize(this.serverless, this.options))
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
