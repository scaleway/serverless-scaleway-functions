// import X = require("Y") throughout - see the comment at the top of
// index.ts for why. Works uniformly whether the target module uses
// `export =` or plain named exports: require() returns an object with the
// same shape either way.
import validate = require("../shared/validate");
import setUpDeployment = require("../shared/setUpDeployment");
import createNamespace = require("./lib/createNamespace");
import createFunctions = require("./lib/createFunctions");
import createContainers = require("./lib/createContainers");
import buildAndPushContainers = require("./lib/buildAndPushContainers");
import uploadCode = require("./lib/uploadCode");
import deployFunctions = require("./lib/deployFunctions");
import deployContainers = require("./lib/deployContainers");
import deployTriggers = require("./lib/deployTriggers");
import scalewayApi = require("../shared/api/endpoint");
import domainApi = require("../shared/api/domain");
import ScalewayProvider = require("../provider/scalewayProvider");
import type { Serverless } from "../shared/serverlessTypes";

interface DeployOptions {
  [key: string]: unknown;
}

class ScalewayDeploy {
  serverless: Serverless;
  options: DeployOptions;
  provider: ScalewayProvider;
  hooks: Record<string, () => Promise<unknown>>;

  // Mixed in via Object.assign below - see the identical comment in
  // invoke/scalewayInvoke.ts. Only the methods this file actually calls are
  // declared, not the full mixed-in surface (which also includes every
  // shared/api/* method, since `api`'s own properties get copied here too).
  validate!: () => Promise<void>;
  setUpDeployment!: () => void;
  createServerlessNamespace!: () => Promise<void>;
  updateServerlessNamespace!: () => Promise<unknown>;
  createFunctions!: () => Promise<unknown>;
  createContainers!: () => Promise<unknown>;
  buildAndPushContainers!: () => Promise<void>;
  uploadCode!: () => Promise<unknown>;
  deployFunctions!: () => Promise<void[]>;
  deployContainers!: () => Promise<unknown[]>;
  deployTriggers!: () => Promise<unknown[] | undefined>;

  constructor(serverless: Serverless, options: DeployOptions) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway") as ScalewayProvider;
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(
      this,
      validate,
      setUpDeployment,
      createNamespace,
      createFunctions,
      createContainers,
      buildAndPushContainers,
      uploadCode,
      deployFunctions,
      deployContainers,
      deployTriggers,
      domainApi,
      api,
    );

    const chainContainers = async (): Promise<unknown> => {
      if (
        this.provider.serverless.service.custom &&
        this.provider.serverless.service.custom.containers &&
        Object.keys(this.provider.serverless.service.custom.containers)
          .length !== 0
      ) {
        await this.buildAndPushContainers();
        await this.createContainers();
        return this.deployContainers();
      }

      return undefined;
    };

    const chainFunctions = async (): Promise<unknown> => {
      if (
        this.provider.serverless.service.functions &&
        Object.keys(this.provider.serverless.service.functions).length !== 0
      ) {
        await this.createFunctions();
        await this.uploadCode();
        return this.deployFunctions();
      }
      return undefined;
    };

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      "before:deploy:deploy": async () => {
        await this.setUpDeployment();
        return this.validate();
      },
      // Every tasks related to functions deployment:
      // - Create a namespace if it does not exist
      // - Create each functions in API if it does not exist
      // - Zip code - zip each function
      // - Get Presigned URL and Push code for each function to S3
      // - Deploy each function / container
      "deploy:deploy": async () => {
        await this.createServerlessNamespace();
        await this.updateServerlessNamespace();
        await chainContainers();
        await chainFunctions();
        return this.deployTriggers();
      },
    };
  }
}

export = ScalewayDeploy;
