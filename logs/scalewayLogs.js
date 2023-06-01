const BbPromise = require("bluebird");
const setUpDeployment = require("../shared/setUpDeployment");
const getLogs = require("./lib/getLogs");
const scalewayApi = require("../shared/api/endpoint");

class ScalewayLogs {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway");
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, setUpDeployment, getLogs, api);
    this.hooks = {
      "before:logs:logs": () => BbPromise.bind(this).then(this.setUpDeployment),
      "logs:logs": () => BbPromise.bind(this).then(this.getLogs),
    };
  }
}

module.exports = ScalewayLogs;
