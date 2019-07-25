'use strict';

const removeAllTestNamespaces = (api, registryApi) => {
  const namespaces = api.listNamespaces();
  namespaces.forEach((namespace) => {
    if (!namespace.name.contains('scwtestsls')) {
      return undefined;
    }
    try {
      api.deleteNamespace(namespace.id);
      registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
    } catch (err) {
      // Ignore errors, as we might manually delete registry namespaces from registry for example
    }
    return undefined;
  });
};

module.exports = {
  removeAllTestNamespaces,
};
