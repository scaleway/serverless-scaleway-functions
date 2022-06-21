"use strict";

module.exports = {
  displayInfo() {
    const configInput = this.serverless.configurationInput;

    this.getNamespaceFromList(configInput.service).then((namespace) => {
      if (namespace === undefined || namespace === null ||
         namespace.id === undefined || namespace.id === null) {
        return;
      }

      if (
        configInput.custom &&
        configInput.custom.containers &&
        Object.keys(configInput.custom.containers).length !== 0
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
