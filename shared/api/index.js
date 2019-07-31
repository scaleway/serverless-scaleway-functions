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

/**
 * Display the right error message, check if error has a response and data attribute
 * to properly display either the global error, or the component-level error (function/container)
 * @param {Error} err - Error thrown
 */
function manageError(err) {
  // eslint-disable-next-line no-param-reassign
  err.response = err.response || {};
  if (!err.response || !err.response.data) {
    return err;
  }
  return err.response.data.message || err.response.data.error_message;
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
