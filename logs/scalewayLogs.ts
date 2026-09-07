// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import setUpDeployment = require("../shared/setUpDeployment");
import getLogs = require("./lib/getLogs");
import scalewayApi = require("../shared/api/endpoint");
import ScalewayProvider = require("../provider/scalewayProvider");
import type { Serverless } from "../shared/serverlessTypes";

interface LogsOptions {
  [key: string]: unknown;
}

class ScalewayLogs {
  serverless: Serverless;
  options: LogsOptions;
  provider: ScalewayProvider;
  hooks: Record<string, () => Promise<unknown> | void>;

  setUpDeployment!: () => void;
  getLogs!: () => Promise<void>;

  constructor(serverless: Serverless, options: LogsOptions) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway") as ScalewayProvider;
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, setUpDeployment, getLogs, api);
    this.hooks = {
      "before:logs:logs": () => this.setUpDeployment(),
      "logs:logs": () => this.getLogs(),
    };
  }
}

export = ScalewayLogs;
