const BbPromise = require("bluebird");
const validate = require("../shared/validate");
const setUpDeployment = require("../shared/setUpDeployment");
const createNamespace = require("./lib/createNamespace");
const createFunctions = require("./lib/createFunctions");
const createContainers = require("./lib/createContainers");
const buildAndPushContainers = require("./lib/buildAndPushContainers");
const uploadCode = require("./lib/uploadCode");
const deployFunctions = require("./lib/deployFunctions");
const deployContainers = require("./lib/deployContainers");
const deployTriggers = require("./lib/deployTriggers");
const scalewayApi = require("../shared/api/endpoint");
const domainApi = require("../shared/api/domain");

class ScalewayDeploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway");
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
      api
    );

    function chainContainers() {
      if (
        this.provider.serverless.service.custom &&
        this.provider.serverless.service.custom.containers &&
        Object.keys(this.provider.serverless.service.custom.containers)
          .length !== 0
      ) {
        return this.createContainers()
          .then(this.buildAndPushContainers)
          .then(this.deployContainers);
      }
      return undefined;
    }

    function chainFunctions() {
      if (
        this.provider.serverless.service.functions &&
        Object.keys(this.provider.serverless.service.functions).length !== 0
      ) {
        return this.createFunctions()
          .then(this.uploadCode)
          .then(this.deployFunctions);
      }
      return undefined;
    }

    this.hooks = {
      // Validate serverless.yml, set up default values, configure deployment...
      "before:deploy:deploy": () =>
        BbPromise.bind(this).then(this.setUpDeployment).then(this.validate),
      // Every tasks related to functions deployment:
      // - Create a namespace if it does not exist
      // - Create each functions in API if it does not exist
      // - Zip code - zip each function
      // - Get Presigned URL and Push code for each function to S3
      // - Deploy each function / container
      "deploy:deploy": () =>
        BbPromise.bind(this)
          .then(this.createServerlessNamespace)
          .then(chainContainers)
          .then(chainFunctions)
          .then(this.updateServerlessNamespace)
          .then(this.deployTriggers),
    };
  }
}

module.exports = ScalewayDeploy;
