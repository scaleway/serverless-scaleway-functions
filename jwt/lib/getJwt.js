"use strict";

const BbPromise = require("bluebird");
const { PRIVACY_PRIVATE } = require("../../shared/constants");

module.exports = {
  getJwt() {
    if (typeof this.listFunctions === "function") {
      return BbPromise.bind(this)
        .then(() =>
          this.getNamespaceFromList(
            this.namespaceName,
            this.provider.getScwProject()
          )
        )
        .then(this.setNamespace)
        .then(this.getJwtNamespace)
        .then(() => this.listFunctions(this.namespace.id))
        .then(this.getJwtFunctions);
    }
    if (typeof this.listContainers === "function") {
      return BbPromise.bind(this)
        .then(() =>
          this.getNamespaceFromList(
            this.namespaceName,
            this.provider.getScwProject()
          )
        )
        .then(this.setNamespace)
        .then(this.getJwtNamespace)
        .then(() => this.listContainers(this.namespace.id))
        .then(this.getJwtContainers);
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

  getJwtNamespace() {
    return this.issueJwtNamespace(this.namespace.id, this.tokenExpirationDate)
      .then((response) =>
        Object.assign(this.namespace, { token: response.token })
      )
      .then(() =>
        this.serverless.cli.log(
          `Namespace <${this.namespace.name}> token (valid until ${this.tokenExpirationDate}):\n${this.namespace.token}\n`
        )
      );
  },

  getJwtFunctions(functions) {
    const promises = functions.map((func) => {
      if (func.privacy === PRIVACY_PRIVATE) {
        return this.issueJwtFunction(func.id, this.tokenExpirationDate)
          .then((response) => Object.assign(func, { token: response.token }))
          .then(() =>
            this.serverless.cli.log(
              `Function <${func.name}> token (valid until ${this.tokenExpirationDate}):\n${func.token}\n`
            )
          );
      }
      return undefined;
    });
    return Promise.all(promises);
  },

  getJwtContainers(containers) {
    const promises = containers.map((container) => {
      if (container.privacy === PRIVACY_PRIVATE) {
        return this.issueJwtFunction(container.id, this.tokenExpirationDate)
          .then((response) =>
            Object.assign(container, { token: response.token })
          )
          .then(() =>
            this.serverless.cli.log(
              `Container <${container.name}> token (valid until ${this.tokenExpirationDate}):\n${container.token}\n`
            )
          );
      }
      return undefined;
    });
    return Promise.all(promises);
  },
};
