const https = require('https');
const axios = require('axios');

const domainApi = require('./domain');
const namespacesApi = require('./namespaces');
const functionsApi = require('./functions');
const containersApi = require('./containers');
const triggersApi = require('./triggers');
const jwtApi = require('./jwt');
const logsApi = require('./logs');
const runtimesApi = require('./runtimes');

// Registry
const RegistryApi = require('./registry');

function getApiManager(apiUrl, token) {
  // axios.interceptors.request.use(request => {
  //   //console.log('Starting Request', JSON.stringify(request, null, 2))
  //   console.log('Starting Request', request)
  //   return request
  // })
  
  // axios.interceptors.response.use(response => {

  //   console.log('Starting Request', response);
  //   //console.log('Response:', JSON.stringify(response, null, 2))
  //   return response
  // })

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

class FunctionApi {
  constructor(apiUrl, token) {
    console.log("call constructor FunctionApi")
    this.apiManager = getApiManager(apiUrl, token);
    Object.assign(
      this,
      domainApi,
      namespacesApi,
      functionsApi,
      triggersApi,
      jwtApi,
      logsApi,
      runtimesApi,
    );
  }
}

class ContainerApi {
  constructor(apiUrl, token) {
    this.apiManager = getApiManager(apiUrl, token);
    Object.assign(
      this,
      domainApi,
      namespacesApi,
      containersApi,
      triggersApi,
      jwtApi,
      logsApi,
      runtimesApi,
    );
  }
}


module.exports = {
  getApiManager,
  FunctionApi,
  ContainerApi,
  RegistryApi,
};
