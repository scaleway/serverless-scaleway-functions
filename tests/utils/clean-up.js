'use strict';

const { Api, RegistryApi } = require('../../shared/api');
const { FUNCTIONS_API_URL } = require('../../shared/constants');

const removeAllTestNamespaces = async (api, registryApi) => {
  const namespaces = await api.listNamespaces();
  namespaces.forEach(async (namespace) => {
    if (!namespace.name.includes('scwtestsls')) {
      return undefined;
    }
    try {
      await api.deleteNamespace(namespace.id);
      await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
    } catch (err) {
      // Ignore errors, as we might manually delete registry namespaces from registry for example
    }
    return undefined;
  });
};

const api = new Api(FUNCTIONS_API_URL, process.env.SCW_TOKEN);
const registryApi = new RegistryApi(process.env.SCW_TOKEN);

removeAllTestNamespaces(api, registryApi);

module.exports = {
  removeAllTestNamespaces,
};
