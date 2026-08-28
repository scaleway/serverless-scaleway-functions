"use strict";

module.exports = {
  async removeNamespace() {
    this.serverless.cli.log(
      "Removing namespace and associated functions/triggers...",
    );
    const namespace = await this.getNamespaceFromList(
      this.namespaceName,
      this.provider.getScwProject(),
    );
    return this.removeSingleNamespace(namespace);
  },

  removeSingleNamespace(namespace) {
    if (!namespace)
      throw new Error(
        `Unable to remove namespace and functions: No namespace found with name ${this.namespaceName}`,
      );
    return this.deleteNamespace(namespace.id)
      .then(() => this.waitNamespaceIsDeleted(namespace.id))
      .then(() =>
        this.serverless.cli.log("Namespace has been deleted successfully"),
      );
  },
};
