'use strict';

const BbPromise = require('bluebird');

module.exports = {
  createNamespace() {
    return BbPromise.bind(this)
    .then(this.getNamespace)
    .then(this.createIfNotExists);
  },

  saveNamespaceToProvider(namespace) {
    this.namespace = namespace;
  },

  createIfNotExists(foundNamespace) {
    // If Space already exists -> Do not create

    if (foundNamespace && foundNamespace.status === 'error') {
      throw new Error(foundNamespace.error_message)
    }

    const isReady = foundNamespace && foundNamespace.status === 'ready';
    if (isReady) {
      this.saveNamespaceToProvider(foundNamespace);
      this.updateNamespace(foundNamespace);
      return BbPromise.resolve();
    }

    if (foundNamespace && !isReady) {
      this.serverless.cli.log('Waiting for Namespace to become ready...');
      this.updateNamespace(foundNamespace);
      return this.waitNamespaceIsReady();
    }

    this.serverless.cli.log('Creating namespace...');
    const params = {
      name: this.namespaceName,
      organization_id: this.provider.getScwOrganization(),
      environment_variables: this.namespaceVariables,
    };

    return this.provider.apiManager.post('namespaces', params)
      .then(response => this.saveNamespaceToProvider(response.data))
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
      .then(() => this.waitNamespaceIsReady());
  },

  waitNamespaceIsReady() {
    return this.provider.apiManager.get(`namespaces/${this.namespace.id}`)
      .then((response) => {
        if (response.data.status == 'error') {
          throw new Error(response.data.error_message)
        }
        if (response.data.status !== 'ready') {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitNamespaceIsReady()), 1000);
          });
        }
        this.saveNamespaceToProvider(response.data);
        return true;
      });
  },

  updateNamespace(foundNamespace) {
    if (this.namespaceVariables) {

      const params = {};
      params.environment_variables = this.namespaceVariables

      return this.provider.apiManager.patch(`namespaces/${foundNamespace.id}`, params)
        .catch((err) => {
          throw new Error(err.response.data.message)
        })
    }
  }
};
