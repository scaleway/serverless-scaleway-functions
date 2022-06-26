"use strict";

const yaml = require('yaml');

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
            const doc = new yaml.Document();
            doc.contents = container;
            this.serverless.cli.log(doc.toString());
          });
        });
      } else {
        this.listFunctions(namespace.id).then((functions) => {
          functions.forEach((func) => {
            const doc = new yaml.Document();
            doc.contents = func;
            this.serverless.cli.log(doc.toString());
          });
        });
      }
    });
  },
};
