"use strict";

module.exports = {
  async removeNamespace() {
    this.serverless.cli.log(
      "Removing namespace and associated functions/triggers..."
    );
    const namespace = await this.getNamespaceFromList(
      this.namespaceName,
      this.provider.getScwProject()
    );
    return this.removeSingleNamespace(namespace);
  },

  async removeSingleNamespace(namespace) {
    if (!namespace)
      throw new Error(
        `Unable to remove namespace and functions: No namespace found with name ${this.namespaceName}`
      );
    await this.deleteNamespace(namespace.id);
    await this.waitNamespaceIsDeleted(namespace.id);
    this.serverless.cli.log("Namespace has been deleted successfully");
  },
};
