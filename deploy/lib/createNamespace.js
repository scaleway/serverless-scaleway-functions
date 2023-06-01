"use strict";

const BbPromise = require("bluebird");
const secrets = require("../../shared/secrets");

module.exports = {
  createServerlessNamespace() {
    return BbPromise.bind(this)
      .then(() =>
        this.getNamespaceFromList(
          this.namespaceName,
          this.provider.getScwProject()
        )
      )
      .then(this.createIfNotExists);
  },

  updateServerlessNamespace() {
    return BbPromise.bind(this).then(() => this.updateNamespaceConfiguration());
  },

  saveNamespaceToProvider(namespace) {
    this.namespace = namespace;
  },

  createIfNotExists(foundNamespace) {
    // If Space already exists -> Do not create
    if (foundNamespace && foundNamespace.status === "error") {
      this.saveNamespaceToProvider(foundNamespace);
      throw new Error(foundNamespace.error_message);
    }

    if (foundNamespace && foundNamespace.status === "ready") {
      this.saveNamespaceToProvider(foundNamespace);
      return BbPromise.resolve();
    }

    if (foundNamespace && foundNamespace.status !== "ready") {
      this.serverless.cli.log("Waiting for Namespace to become ready...");
      return this.waitNamespaceIsReadyAndSave();
    }

    this.serverless.cli.log("Creating namespace...");
    const params = {
      name: this.namespaceName,
      project_id: this.provider.getScwProject(),
      environment_variables: this.namespaceVariables,
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        this.namespaceSecretVariables
      ),
    };

    return this.createNamespace(params)
      .then((response) => this.saveNamespaceToProvider(response))
      .then(() => this.waitNamespaceIsReadyAndSave());
  },

  async updateNamespaceConfiguration() {
    if (this.namespaceVariables || this.namespaceSecretVariables) {
      const params = {};
      if (this.namespaceVariables) {
        params.environment_variables = this.namespaceVariables;
      }
      if (this.namespaceSecretVariables) {
        params.secret_environment_variables = await secrets.mergeSecretEnvVars(
          this.namespace.secret_environment_variables,
          secrets.convertObjectToModelSecretsArray(
            this.namespaceSecretVariables
          ),
          this.serverless.cli
        );
      }
      return this.updateNamespace(this.namespace.id, params);
    }
    return undefined;
  },

  waitNamespaceIsReadyAndSave() {
    return this.waitNamespaceIsReady(this.namespace.id).then((namespace) =>
      this.saveNamespaceToProvider(namespace)
    );
  },
};
