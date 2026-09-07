// import X = require("Y") throughout this file, not `import X from "Y"` -
// see the comment at the top of index.ts for why.
import fs = require("fs");
import os = require("os");
import path = require("path");
import yaml = require("js-yaml");

// import X = require("Y") only binds one name to the whole module, so a
// multi-name import needs the namespace bound once, then destructured from
// that (already-typed) local - a bare `const { A, B } = require("Y")`
// would type A/B as `any`, since plain require() isn't specially typed by
// TypeScript the way `import X = require("Y")` is.
import constants = require("../shared/constants");
const {
  FUNCTIONS_API_URL,
  CONTAINERS_API_URL,
  REGISTRY_API_URL,
  DEFAULT_REGION,
} = constants;
import type { Serverless } from "../shared/serverlessTypes";

const providerName = "scaleway";

interface ProviderOptions {
  "scw-token"?: string;
  "scw-project"?: string;
  "scw-region"?: string;
  [key: string]: unknown;
}

interface LocalScwConfig {
  secret_key?: string;
  default_project_id?: string;
  default_region?: string;
}

class ScalewayProvider {
  static scwConfigFile = path.join(
    os.homedir(),
    ".config",
    "scw",
    "config.yaml",
  );

  static getProviderName(): string {
    return providerName;
  }

  serverless: Serverless;
  provider: ScalewayProvider;
  options?: ProviderOptions;
  scwToken?: string;
  scwProject?: string;
  scwRegion?: string;
  apiFunctionUrl?: string;
  apiContainerUrl?: string;
  registryApiUrl?: string;

  constructor(serverless: Serverless) {
    this.serverless = serverless;
    this.provider = this;
    this.serverless.setProvider(providerName, this);
  }

  getScwProject(): string | undefined {
    return this.scwProject;
  }

  getScwRegion(): string | undefined {
    return this.scwRegion;
  }

  getFunctionCredentials(): { apiUrl?: string; token?: string } {
    return {
      apiUrl: this.apiFunctionUrl,
      token: this.scwToken,
    };
  }

  getContainerCredentials(): { apiUrl?: string; token?: string } {
    return {
      apiUrl: this.apiContainerUrl,
      token: this.scwToken,
    };
  }

  setCredentials(options: ProviderOptions): void {
    // On serverless info command we do not want log pollution from authentication.
    // This is necessary to use it in an automated environment.
    let hideLog = false;
    if (
      this.serverless.configurationInput &&
      this.serverless.configurationInput.service &&
      this.serverless.configurationInput.service === "serverlessInfo"
    ) {
      hideLog = true;
    }

    if (options["scw-token"] && options["scw-project"]) {
      if (!hideLog) {
        this.serverless.cli.log(
          "Using credentials from command line parameters",
        );
      }

      this.scwToken = options["scw-token"];
      this.scwProject = options["scw-project"];
    } else if (
      process.env.SCW_SECRET_KEY &&
      process.env.SCW_DEFAULT_PROJECT_ID
    ) {
      if (!hideLog) {
        this.serverless.cli.log("Using credentials from system environment");
      }

      this.scwToken = process.env.SCW_SECRET_KEY;
      this.scwProject = process.env.SCW_DEFAULT_PROJECT_ID;
    } else if (process.env.SCW_TOKEN && process.env.SCW_PROJECT) {
      if (!hideLog) {
        this.serverless.cli.log("Using credentials from system environment");
        this.serverless.cli.log(
          "NOTICE: you are using deprecated environment variable notation,",
        );
        this.serverless.cli.log(
          "please update to SCW_SECRET_KEY and SCW_DEFAULT_PROJECT_ID",
        );
      }

      this.scwToken = process.env.SCW_TOKEN;
      this.scwProject = process.env.SCW_PROJECT;
    } else if (
      this.serverless.service.provider.scwToken ||
      this.serverless.service.provider.scwProject
    ) {
      if (!hideLog) {
        this.serverless.cli.log("Using credentials from serverless.yml");
      }

      this.scwToken = this.serverless.service.provider.scwToken;
      this.scwProject = this.serverless.service.provider.scwProject;
    } else if (fs.existsSync(ScalewayProvider.scwConfigFile)) {
      if (!hideLog) {
        this.serverless.cli.log(
          `Using credentials from ${ScalewayProvider.scwConfigFile}`,
        );
      }

      const fileData = fs.readFileSync(ScalewayProvider.scwConfigFile, "utf8");
      const scwConfig = yaml.load(fileData) as LocalScwConfig;

      this.scwToken = scwConfig.secret_key;
      this.scwProject = scwConfig.default_project_id;
      this.scwRegion = scwConfig.default_region;
    } else {
      if (!hideLog) {
        this.serverless.cli.log(
          "Unable to locate Scaleway provider credentials",
        );
      }

      this.scwToken = "";
      this.scwProject = "";
    }
  }

  setApiURL(options: ProviderOptions): void {
    if (options["scw-region"]) {
      this.scwRegion = options["scw-region"];
    } else if (process.env.SCW_REGION) {
      this.scwRegion = process.env.SCW_REGION;
    } else if (this.serverless.service.provider.scwRegion) {
      this.scwRegion = this.serverless.service.provider.scwRegion;
    } else {
      // this.scwRegion may already have been set by setCredentials() from
      // the local Scaleway CLI config file's default_region.
      this.scwRegion = this.scwRegion || DEFAULT_REGION;
    }
    this.apiFunctionUrl =
      process.env.SCW_FUNCTION_URL || `${FUNCTIONS_API_URL}/${this.scwRegion}`;
    this.apiContainerUrl =
      process.env.SCW_CONTAINER_URL ||
      `${CONTAINERS_API_URL}/${this.scwRegion}`;
    this.registryApiUrl = `${REGISTRY_API_URL}/${this.scwRegion}/`;
  }

  async initialize(
    serverless: Serverless,
    options: ProviderOptions,
  ): Promise<void> {
    this.serverless = serverless;
    this.options = options;

    this.setCredentials(options);
    this.setApiURL(options);
  }
}

export = ScalewayProvider;
