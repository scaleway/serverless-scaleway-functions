'use strict';

const axios = require('axios');
const https = require('https');
const { manageError } = require('./utils');
const { REGISTRY_API_URL } = require('../constants');

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
