const BbPromise = require("bluebird");
const setUpDeployment = require("../shared/setUpDeployment");
const getJwt = require("./lib/getJwt");
const scalewayApi = require("../shared/api/endpoint");

class ScalewayJwt {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway");
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, setUpDeployment, getJwt, api);

    this.commands = {
      jwt: {
        usage: "Get JWT Token",
        lifecycleEvents: ["jwt"],
        commands: {
          start: {
            usage:
              "Get JWT tokens for your namespace and your private functions/containers.",
            lifecycleEvents: ["jwt"],
          },
        },
      },
    };

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      "before:jwt:jwt": () => BbPromise.bind(this).then(this.setUpDeployment),
      "jwt:jwt": () => BbPromise.bind(this).then(this.getJwt),
    };
  }
}

module.exports = ScalewayJwt;
