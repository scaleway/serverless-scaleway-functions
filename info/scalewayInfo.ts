// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import display = require("./lib/display");
import writeServiceOutputs = require("../shared/write-service-outputs");
import scalewayApi = require("../shared/api/endpoint");
import ScalewayProvider = require("../provider/scalewayProvider");
import type { Serverless } from "../shared/serverlessTypes";

interface InfoOptions {
  [key: string]: unknown;
}

class ScalewayInfo {
  serverless: Serverless;
  options: InfoOptions;
  provider: ScalewayProvider;
  commands: Record<string, unknown>;
  hooks: Record<string, () => Promise<unknown> | void>;

  displayInfo!: () => Promise<void>;

  constructor(serverless: Serverless, options: InfoOptions) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway") as ScalewayProvider;
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
      "scaleway:info:displayInfo": async () => this.displayInfo(),
      finalize: () => {
        if (this.serverless.processedInput.commands.join(" ") !== "info")
          return;
        writeServiceOutputs(this.serverless.serviceOutputs!);
      },
    };
  }
}

export = ScalewayInfo;
