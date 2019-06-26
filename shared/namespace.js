'use strict';

module.exports = {
  getNamespace() {
    // query Scaleway API to check if space exists
    return this.provider.apiManager.get('namespaces')
      .then((response) => {
        const namespaces = response.data.namespaces;
        return namespaces.find(ns => ns.name === this.namespaceName);
      });
  },
};
