"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");

const BbPromise = require("bluebird");
const { FUNCTIONS_API_URL } = require("../shared/constants");
const { CONTAINERS_API_URL } = require("../shared/constants");
const { REGISTRY_API_URL } = require("../shared/constants");
const { DEFAULT_REGION } = require("../shared/constants");

const providerName = "scaleway";

class ScalewayProvider {
  static scwConfigFile = path.join(
    os.homedir(),
    ".config",
    "scw",
    "config.yaml"
  );

  static getProviderName() {
    return providerName;
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this;
    this.serverless.setProvider(providerName, this);
  }

  getScwProject() {
    return this.scwProject;
  }

  getFunctionCredentials() {
    return {
      apiUrl: this.apiFunctionUrl,
      token: this.scwToken,
    };
  }

  getContainerCredentials() {
    return {
      apiUrl: this.apiContainerUrl,
      token: this.scwToken,
    };
  }

  setCredentials(options) {
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
          "Using credentials from command line parameters"
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
          "NOTICE: you are using deprecated environment variable notation,"
        );
        this.serverless.cli.log(
          "please update to SCW_SECRET_KEY and SCW_DEFAULT_PROJECT_ID"
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
          `Using credentials from ${ScalewayProvider.scwConfigFile}`
        );
      }

      let fileData = fs.readFileSync(ScalewayProvider.scwConfigFile, "utf8");
      let scwConfig = yaml.load(fileData);

      this.scwToken = scwConfig.secret_key;
      this.scwProject = scwConfig.default_project_id;
      this.scwRegion = scwConfig.default_region;
    } else {
      if (!hideLog) {
        this.serverless.cli.log(
          "Unable to locate Scaleway provider credentials"
        );
      }

      this.scwToken = "";
      this.scwProject = "";
    }
  }

  setApiURL(options) {
    if (options["scw-region"]) {
      this.scwRegion = options["scw-region"];
    } else if (process.env.SCW_REGION) {
      this.scwRegion = process.env.SCW_REGION;
    } else {
      this.scwRegion =
        this.serverless.service.provider.scwRegion || DEFAULT_REGION;
    }
    this.apiFunctionUrl =
      process.env.SCW_FUNCTION_URL || `${FUNCTIONS_API_URL}/${this.scwRegion}`;
    this.apiContainerUrl =
      process.env.SCW_CONTAINER_URL ||
      `${CONTAINERS_API_URL}/${this.scwRegion}`;
    this.registryApiUrl = `${REGISTRY_API_URL}/${this.scwRegion}/`;
  }

  initialize(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    return new BbPromise((resolve) => {
      this.setCredentials(options);
      this.setApiURL(options);
      resolve();
    });
  }
}

module.exports = ScalewayProvider;
