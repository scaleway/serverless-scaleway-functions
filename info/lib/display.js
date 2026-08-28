"use strict";

const yaml = require("js-yaml");

module.exports = {
  displayInfo() {
    const configInput = this.serverless.configurationInput;

    return this.getNamespaceFromList(
      configInput.service,
      this.provider.getScwProject(),
    ).then((namespace) => {
      if (
        namespace === undefined ||
        namespace === null ||
        namespace.id === undefined ||
        namespace.id === null
      ) {
        return undefined;
      }

      if (
        configInput.custom &&
        configInput.custom.containers &&
        Object.keys(configInput.custom.containers).length !== 0
      ) {
        return this.listContainers(namespace.id).then((containers) => {
          let output = {};
          containers.forEach((container) => {
            output[container["name"]] = container;
          });
          console.log(yaml.dump({ "Stack Outputs": { containers: output } }));
        });
      }

      return this.listFunctions(namespace.id).then((functions) => {
        let output = {};
        functions.forEach((func) => {
          output[func["name"]] = func;
        });
        console.log(yaml.dump({ "Stack Outputs": { functions: output } }));
      });
    });
  },
};
