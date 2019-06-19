'use strict';

const BbPromise = require('bluebird');

module.exports = {
  removeNamespace() {
    this.serverless.cli.log('Removing namespace and associated functions/triggers...');
    return BbPromise.bind(this)
      .then(this.getNamespace)
      .then(this.removeSingleNamespace);
  },

  waitNamespaceIsDeleted(namespace) {
    return this.provider.apiManager.get(`namespaces/${namespace.id}`)
      .then((response) => {
        if (response.data.status === 'deleting') {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitNamespaceIsDeleted(namespace)), 1000);
          });
        }
        return true;
      });
  },

  removeSingleNamespace(namespace) {
    if (!namespace) throw new Error(`Unable to remove namespace and functions: No namespace found with name ${this.namespaceFullName}`);
    return this.provider.apiManager.delete(`namespaces/${namespace.id}`)
      .then(() => this.waitNamespaceIsDeleted(namespace))
      .catch((err) => {
        if (err.response.status === 404) {
          this.serverless.cli.log('Namespace has been deleted successfully');
          return true;
        }
        throw new Error('An error occured during namespace deletion');
      });
  },
};
