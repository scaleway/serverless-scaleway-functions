"use strict"

module.exports = {
  displayInfo() {
    this.getNamespaceFromList(this.serverless.configurationInput.service)
      .then((namespace) => {
        // Todo : container case
        this.listFunctions(namespace.id)
          .then((functions) => {
            functions.forEach((func) => {
              this.serverless.cli.log(JSON.stringify(func, null, '\t'));
            });
          });
      });
  },
};
