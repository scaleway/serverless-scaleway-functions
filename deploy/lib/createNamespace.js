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
    const isReady = foundNamespace && foundNamespace.status === 'ready';
    if (isReady) {
      this.saveNamespaceToProvider(foundNamespace);
      return BbPromise.resolve();
    }

    if (foundNamespace && !isReady) {
      this.serverless.cli.log('Waiting for Namespace to become ready...');
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
      .then(() => this.waitNamespaceIsReady());
  },

  waitNamespaceIsReady() {
    return this.provider.apiManager.get(`namespaces/${this.namespace.id}`)
      .then((response) => {
        if (response.data.status !== 'ready') {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitNamespaceIsReady()), 1000);
          });
        }
        return true;
      });
  },
};
