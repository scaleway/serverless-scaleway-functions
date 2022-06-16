"use strict";

module.exports = {
  displayInfo() {
    const configInput = this.serverless.configurationInput;

    this.getNamespaceFromList(configInput.service).then((namespace) => {
      if (
        configInput.service.custom &&
        configInput.service.custom.containers &&
        Object.keys(configInput.service.custom.containers).length !== 0
      ) {
        this.listContainers(namespace.id).then((containers) => {
          containers.forEach((container) => {
            this.serverless.cli.log(JSON.stringify(container, null, "\t"));
          });
        });
      } else {
        this.listFunctions(namespace.id).then((functions) => {
          functions.forEach((func) => {
            this.serverless.cli.log(JSON.stringify(func, null, "\t"));
          });
        });
      }
    });
  },
};
