"use strict";

const BbPromise = require("bluebird");

module.exports = {
  removeNamespace() {
    this.serverless.cli.log(
      "Removing namespace and associated functions/triggers..."
    );
    return BbPromise.bind(this)
      .then(() =>
        this.getNamespaceFromList(
          this.namespaceName,
          this.provider.getScwProject()
        )
      )
      .then(this.removeSingleNamespace);
  },

  removeSingleNamespace(namespace) {
    if (!namespace)
      throw new Error(
        `Unable to remove namespace and functions: No namespace found with name ${this.namespaceName}`
      );
    return this.deleteNamespace(namespace.id)
      .then(() => this.waitNamespaceIsDeleted(namespace.id))
      .then(() =>
        this.serverless.cli.log("Namespace has been deleted successfully")
      );
  },
};
