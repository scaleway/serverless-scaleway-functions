"use strict";

const { getApiManager } = require("./utils");
const { manageError } = require("./utils");

class RegistryApi {
  constructor(registryApiUrl, token) {
    this.apiManager = getApiManager(registryApiUrl, token);
  }

  listRegistryNamespace(projectId) {
    return this.apiManager
      .get(`namespaces?projectId=${projectId}`)
      .then((response) => response.data.namespaces)
      .catch(manageError);
  }

  deleteRegistryNamespace(namespaceId) {
    return this.apiManager
      .delete(`namespaces/${namespaceId}`)
      .then((response) => response.data)
      .catch(manageError);
  }

  createRegistryNamespace(params) {
    return this.apiManager
      .post("namespaces", params)
      .then((response) => response.data)
      .catch(manageError);
  }
}

module.exports = RegistryApi;
