"use strict";

const yaml = require("js-yaml");

module.exports = {
  displayInfo() {
    const configInput = this.serverless.configurationInput;

    this.getNamespaceFromList(
      configInput.service,
      this.provider.getScwProject()
    ).then((namespace) => {
      if (
        namespace === undefined ||
        namespace === null ||
        namespace.id === undefined ||
        namespace.id === null
      ) {
        return;
      }

      if (
        configInput.custom &&
        configInput.custom.containers &&
        Object.keys(configInput.custom.containers).length !== 0
      ) {
        this.listContainers(namespace.id).then((containers) => {
          let output = {};
          containers.forEach((container) => {
            output[container["name"]] = container;
          });
          console.log(yaml.dump({ "Stack Outputs": { containers: output } }));
        });
      } else {
        this.listFunctions(namespace.id).then((functions) => {
          let output = {};
          functions.forEach((func) => {
            output[func["name"]] = func;
          });
          console.log(yaml.dump({ "Stack Outputs": { functions: output } }));
        });
      }
    });
  },
};
