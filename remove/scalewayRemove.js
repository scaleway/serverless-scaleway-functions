const BbPromise = require("bluebird");
const setUpDeployment = require("../shared/setUpDeployment");
const removeNamespace = require("./lib/removeNamespace");
const validate = require("../shared/validate");
const scalewayApi = require("../shared/api/endpoint");

class ScalewayDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway");
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, setUpDeployment, removeNamespace, validate, api);

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      "before:remove:remove": () =>
        BbPromise.bind(this).then(this.setUpDeployment).then(this.validate),
      // Every tasks related to space deletion:
      // - Delete given space if it exists
      "remove:remove": () => BbPromise.bind(this).then(this.removeNamespace),
    };
  }
}

module.exports = ScalewayDeploy;
