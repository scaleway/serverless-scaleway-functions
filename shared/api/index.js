const https = require('https');
const axios = require('axios');

const namespacesApi = require('./namespaces');
const functionsApi = require('./functions');
const containersApi = require('./containers');
// Registry
const RegistryApi = require('./registry');

function getApiManager(apiUrl, token) {
  return axios.create({
    baseURL: apiUrl,
    headers: {
      'X-Auth-Token': token,
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
  });
}

function manageError(err) {
  return err.response && err.response.data ? err.response.data.message : err;
}

class Api {
  constructor(apiUrl, token) {
    this.apiManager = getApiManager(apiUrl, token);
    Object.assign(
      this,
      namespacesApi,
      functionsApi,
      containersApi,
    );
  }
}

module.exports = {
  getApiManager,
  manageError,
  Api,
  RegistryApi,
};
