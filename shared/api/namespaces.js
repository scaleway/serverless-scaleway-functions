'use strict';

const { manageError } = require('./index');

module.exports = {
  listNamespaces() {
    return this.apimanager.get('namespaces?count=100')
      .then(response => response.data.namespaces || [])
      .catch(manageError);
  },

  getNamespaceFromList(namespaceName) {
    // query Scaleway API to check if space exists
    return this.apiManager.get(`namespaces?name=${namespaceName}`)
      .then((response) => {
        const { namespaces } = response.data;
        return namespaces.find(ns => ns.name === namespaceName);
      })
      .catch(manageError);
  },

  getNamespace(namespaceId) {
    return this.apiManager.get(`namespaces/${namespaceId}`)
      .then(response => response.data)
      .catch(manageError);
  },

  waitNamespaceIsReady(namespaceId) {
    return this.getNamespace(namespaceId)
      .then((namespace) => {
        if (namespace.status === 'error') {
          throw new Error(namespace.error_message);
        }
        if (namespace.status !== 'ready') {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitNamespaceIsReady(namespaceId)), 1000);
          });
        }
        return namespace;
      });
  },

  createNamespace(params) {
    return this.apiManager.post('namespaces', params)
      .then(response => response.data)
      .catch(manageError);
  },

  updateNamespace(namespaceId, params) {
    return this.apiManager.patch(`namespaces/${namespaceId}`, params)
      .catch(manageError);
  },

  deleteNamespace(namespaceId) {
    return this.apiManager.delete(`namespaces/${namespaceId}`)
      .then(response => response.data)
      .catch(manageError);
  },

  waitNamespaceIsDeleted(namespaceId) {
    return this.getNamespace(namespaceId)
      .then((response) => {
        if (response.status === 'deleting') {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitNamespaceIsDeleted(namespaceId)), 1000);
          });
        }
        return true;
      });
  },
};
