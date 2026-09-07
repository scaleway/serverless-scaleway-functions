// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import setUpDeployment = require("../shared/setUpDeployment");
import getJwt = require("./lib/getJwt");
import scalewayApi = require("../shared/api/endpoint");
import ScalewayProvider = require("../provider/scalewayProvider");
import type { Serverless } from "../shared/serverlessTypes";

interface JwtOptions {
  [key: string]: unknown;
}

class ScalewayJwt {
  serverless: Serverless;
  options: JwtOptions;
  provider: ScalewayProvider;
  commands: Record<string, unknown>;
  hooks: Record<string, () => Promise<unknown> | void>;

  setUpDeployment!: () => void;
  getJwt!: () => Promise<unknown[] | undefined>;

  constructor(serverless: Serverless, options: JwtOptions) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway") as ScalewayProvider;
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
      "before:jwt:jwt": () => this.setUpDeployment(),
      "jwt:jwt": () => this.getJwt(),
    };
  }
}

export = ScalewayJwt;
