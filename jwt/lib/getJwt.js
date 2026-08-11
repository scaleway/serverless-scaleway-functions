"use strict";

const { PRIVACY_PRIVATE } = require("../../shared/constants");

module.exports = {
  async getJwt() {
    if (typeof this.listFunctions === "function") {
      const namespace = await this.getNamespaceFromList(
        this.namespaceName,
        this.provider.getScwProject()
      );
      this.setNamespace(namespace);
      await this.getJwtNamespace();
      const functions = await this.listFunctions(this.namespace.id);
      await this.getJwtFunctions(functions);
      return;
    }
    if (typeof this.listContainers === "function") {
      const namespace = await this.getNamespaceFromList(
        this.namespaceName,
        this.provider.getScwProject()
      );
      this.setNamespace(namespace);
      await this.getJwtNamespace();
      const containers = await this.listContainers(this.namespace.id);
      await this.getJwtContainers(containers);
    }
  },

  setNamespace(namespace) {
    if (!namespace) {
      throw new Error(
        `Namespace <${this.namespaceName}> doesn't exist, you should deploy it first.`
      );
    }
    this.namespace = namespace;
  },

  async getJwtNamespace() {
    const response = await this.issueJwtNamespace(
      this.namespace.id,
      this.tokenExpirationDate
    );
    Object.assign(this.namespace, { token: response.token });
    this.serverless.cli.log(
      `Namespace <${this.namespace.name}> token (valid until ${this.tokenExpirationDate}):\n${this.namespace.token}\n`
    );
  },

  async getJwtFunctions(functions) {
    const promises = functions.map(async (func) => {
      if (func.privacy === PRIVACY_PRIVATE) {
        const response = await this.issueJwtFunction(
          func.id,
          this.tokenExpirationDate
        );
        Object.assign(func, { token: response.token });
        this.serverless.cli.log(
          `Function <${func.name}> token (valid until ${this.tokenExpirationDate}):\n${func.token}\n`
        );
      }
    });
    await Promise.all(promises);
  },

  async getJwtContainers(containers) {
    const promises = containers.map(async (container) => {
      if (container.privacy === PRIVACY_PRIVATE) {
        const response = await this.issueJwtFunction(
          container.id,
          this.tokenExpirationDate
        );
        Object.assign(container, { token: response.token });
        this.serverless.cli.log(
          `Container <${container.name}> token (valid until ${this.tokenExpirationDate}):\n${container.token}\n`
        );
      }
    });
    await Promise.all(promises);
  },
};
