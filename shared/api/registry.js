'use strict';

const axios = require('axios');
const https = require('https');
const { manageError } = require('./utils');

class RegistryApi {
  constructor(registryApiUrl, token) {
    this.apiManager = axios.create({
      baseURL: registryApiUrl,
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
