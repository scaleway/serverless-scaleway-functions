'use strict';

const axios = require('axios');
const https = require('https');
const { manageError } = require('./index');

const REGISTRY_API_URL = 'https://api.scaleway.com/registry/v1beta2/regions/fr-par/';

class RegistryApi {
  constructor(token) {
    this.apiManager = axios.create({
      baseURL: REGISTRY_API_URL,
      headers: {
        'X-Auth-Token': token,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }

  deleteRegistryNamespace(namespaceId) {
    return this.apiManager.delete(`namespaces/${namespaceId}`)
      .catch(manageError);
  }
}

module.exports = RegistryApi;
