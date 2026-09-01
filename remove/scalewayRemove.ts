// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import setUpDeployment = require("../shared/setUpDeployment");
import removeNamespace = require("./lib/removeNamespace");
import validate = require("../shared/validate");
import scalewayApi = require("../shared/api/endpoint");
import ScalewayProvider = require("../provider/scalewayProvider");
import type { Serverless } from "../shared/serverlessTypes";

interface RemoveOptions {
  [key: string]: unknown;
}

class ScalewayRemove {
  serverless: Serverless;
  options: RemoveOptions;
  provider: ScalewayProvider;
  hooks: Record<string, () => Promise<unknown>>;

  // Mixed in via Object.assign below - see the identical comment in
  // invoke/scalewayInvoke.ts for why these are declared rather than
  // inferred.
  setUpDeployment!: () => void;
  validate!: () => Promise<void>;
  removeNamespace!: () => Promise<void>;

  constructor(serverless: Serverless, options: RemoveOptions) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway") as ScalewayProvider;
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, setUpDeployment, removeNamespace, validate, api);

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      "before:remove:remove": async () => {
        await this.setUpDeployment();
        return this.validate();
      },
      // Every tasks related to space deletion:
      // - Delete given space if it exists
      "remove:remove": () => this.removeNamespace(),
    };
  }
}

export = ScalewayRemove;
