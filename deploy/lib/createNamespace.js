'use strict';

const BbPromise = require('bluebird');

module.exports = {
  createServerlessNamespace() {
    return BbPromise.bind(this)
      .then(() => this.getNamespaceFromList(this.namespaceName))
      .then(this.createIfNotExists);
  },

  updateServerlessNamespace() {
    return BbPromise.bind(this)
      .then(() => this.updateNamespaceConfiguration());
  },

  saveNamespaceToProvider(namespace) {
    this.namespace = namespace;
  },

  createIfNotExists(foundNamespace) {
    // If Space already exists -> Do not create
    if (foundNamespace && foundNamespace.status === 'error') {
      this.saveNamespaceToProvider(foundNamespace);
      throw new Error(foundNamespace.error_message);
    }

    if (foundNamespace && foundNamespace.status === 'ready') {
      this.saveNamespaceToProvider(foundNamespace);
      return BbPromise.resolve();
    }

    if (foundNamespace && foundNamespace.status !== 'ready') {
      this.serverless.cli.log('Waiting for Namespace to become ready...');
      return this.waitNamespaceIsReadyAndSave();
    }

    this.serverless.cli.log('Creating namespace...');
    const params = {
      name: this.namespaceName,
      project_id: this.provider.getScwProject(),
      environment_variables: this.namespaceVariables,
    };

    return this.createNamespace(params)
      .then(response => this.saveNamespaceToProvider(response))
      .then(() => this.waitNamespaceIsReadyAndSave());
  },

  updateNamespaceConfiguration() {
    if (this.namespaceVariables) {
      const params = {
        environment_variables: this.namespaceVariables
      };
      return this.updateNamespace(this.namespace.id, params);
    }
    return undefined;
  },

  waitNamespaceIsReadyAndSave() {
    return this.waitNamespaceIsReady(this.namespace.id)
      .then(namespace => this.saveNamespaceToProvider(namespace));
  },
};
