'use strict';

const BbPromise = require('bluebird');

module.exports = {
  createServerlessNamespace() {
    return BbPromise.bind(this)
      .then(this.getNamespaceFromList)
      .then(this.createIfNotExists);
  },

  saveNamespaceToProvider(namespace) {
    this.namespace = namespace;
  },

  createIfNotExists(foundNamespace) {
    // If Space already exists -> Do not create
    if (foundNamespace && foundNamespace.status === 'error') {
      throw new Error(foundNamespace.error_message);
    }

    const isReady = foundNamespace && foundNamespace.status === 'ready';
    if (isReady) {
      this.saveNamespaceToProvider(foundNamespace);
      this.updateNamespaceConfiguration(foundNamespace);
      return BbPromise.resolve();
    }

    if (foundNamespace && !isReady) {
      this.serverless.cli.log('Waiting for Namespace to become ready...');
      this.updateNamespaceConfiguration(foundNamespace);
      return this.waitNamespaceIsReadyAndSave();
    }

    this.serverless.cli.log('Creating namespace...');
    const params = {
      name: this.namespaceName,
      organization_id: this.provider.getScwOrganization(),
      environment_variables: this.namespaceVariables,
    };

    return this.createNamespace(params)
      .then(response => this.saveNamespaceToProvider(response))
      .then(() => this.waitNamespaceIsReadyAndSave());
  },

  updateNamespaceConfiguration(namespace) {
    if (this.namespaceVariables) {
      const params = {};
      params.environment_variables = this.namespaceVariables;
      return this.updateNamespace(namespace.id, params);
    }
    return undefined;
  },

  waitNamespaceIsReadyAndSave() {
    return this.waitNamespaceIsReady(this.namespace.id)
      .then(namespace => this.saveNamespaceToProvider(namespace));
  },
};
