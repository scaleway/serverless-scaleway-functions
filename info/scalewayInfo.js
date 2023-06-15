const BbPromise = require("bluebird");
const display = require("./lib/display");
const writeServiceOutputs = require("../shared/write-service-outputs");
const scalewayApi = require("../shared/api/endpoint");

class ScalewayInfo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway");
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, display, api);

    this.commands = {
      scaleway: {
        type: "entrypoint",
        commands: {
          info: {
            lifecycleEvents: ["displayInfo"],
          },
        },
      },
    };

    this.hooks = {
      "info:info": () => this.serverless.pluginManager.spawn("scaleway:info"),
      "scaleway:info:displayInfo": async () =>
        BbPromise.bind(this).then(this.displayInfo),
      finalize: () => {
        if (this.serverless.processedInput.commands.join(" ") !== "info")
          return;
        writeServiceOutputs(this.serverless.serviceOutputs);
      },
    };
  }
}

module.exports = ScalewayInfo;
