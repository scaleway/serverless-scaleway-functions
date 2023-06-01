const BbPromise = require("bluebird");
const axios = require("axios");
const { EOL } = require("os");

const scalewayApi = require("../shared/api/endpoint");
const setUpDeployment = require("../shared/setUpDeployment");
const validate = require("../shared/validate");

class ScalewayInvoke {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider("scaleway");
    this.provider.initialize(this.serverless, this.options);

    const api = scalewayApi.getApi(this);

    Object.assign(this, validate, setUpDeployment, api);

    this.isContainer = false;
    this.isFunction = false;

    function validateFunctionOrContainer() {
      // Check the user has specified a name, and that it's defined as either a function or container
      if (!this.options.function) {
        const msg = "Function or container not specified";
        this.serverless.cli.log(msg);
        throw new Error(msg);
      }

      this.isContainer = this.isDefinedContainer(this.options.function);
      this.isFunction = this.isDefinedFunction(this.options.function);

      if (!this.isContainer && !this.isFunction) {
        const msg = `Function or container ${this.options.function} not defined in servleress.yml`;
        this.serverless.cli.log(msg);
        throw new Error(msg);
      }
    }

    function lookUpFunctionOrContainer(ns) {
      // List containers/functions in the namespace
      if (this.isContainer) {
        return this.listContainers(ns.id);
      } else {
        return this.listFunctions(ns.id);
      }
    }

    function doInvoke(found) {
      // Filter on name
      let func = found.find((f) => f.name === this.options.function);
      const url = "https://" + func.domain_name;

      // Invoke
      axios
        .get(url)
        .then((res) => {
          // Make sure we write to stdout here to ensure we can capture output
          process.stdout.write(JSON.stringify(res.data));
        })
        .catch((error) => {
          process.stderr.write(error.toString() + EOL);
        });
    }

    this.hooks = {
      "before:invoke:invoke": () =>
        BbPromise.bind(this).then(this.setUpDeployment).then(this.validate),
      "invoke:invoke": () =>
        BbPromise.bind(this)
          .then(validateFunctionOrContainer)
          .then(() =>
            this.getNamespaceFromList(
              this.namespaceName,
              this.provider.getScwProject()
            )
          )
          .then(lookUpFunctionOrContainer)
          .then(doInvoke),
    };
  }
}

module.exports = ScalewayInvoke;
