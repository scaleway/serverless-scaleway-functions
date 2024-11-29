const { getApiManager } = require("./utils");
const accountApi = require("./account");
const domainApi = require("./domain");
const namespacesApi = require("./namespaces");
const functionsApi = require("./functions");
const containersApi = require("./containers");
const triggersApi = require("./triggers");
const jwtApi = require("./jwt");
const logsApi = require("./logs");
const runtimesApi = require("./runtimes");

// Registry
const RegistryApi = require("./registry");

class AccountApi {
  constructor(apiUrl, token) {
    this.apiManager = getApiManager(apiUrl, token);
    Object.assign(this, accountApi);
  }
}

class FunctionApi {
  constructor(apiUrl, token) {
    this.apiManager = getApiManager(apiUrl, token);
    Object.assign(
      this,
      accountApi,
      domainApi,
      namespacesApi,
      functionsApi,
      triggersApi,
      jwtApi,
      logsApi,
      runtimesApi
    );
  }
}

class ContainerApi {
  constructor(apiUrl, token) {
    this.apiManager = getApiManager(apiUrl, token);
    Object.assign(
      this,
      accountApi,
      domainApi,
      namespacesApi,
      containersApi,
      triggersApi,
      jwtApi,
      logsApi,
      runtimesApi
    );
  }
}

module.exports = {
  getApiManager,
  AccountApi,
  FunctionApi,
  ContainerApi,
  RegistryApi,
};
