"use strict";

const axios = require("axios");
const https = require("https");
const { manageError } = require("./utils");

class RegistryApi {
  constructor(registryApiUrl, token) {
    this.apiManager = axios.create({
      baseURL: registryApiUrl,
      headers: {
        "X-Auth-Token": token,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
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
