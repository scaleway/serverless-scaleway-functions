const { FunctionApi } = require(".");
const { ContainerApi } = require(".");

function getApi(object) {
  let api;
  if (
    object.provider.serverless.service.custom &&
    object.provider.serverless.service.custom.containers &&
    Object.keys(object.provider.serverless.service.custom.containers).length !==
      0
  ) {
    const credentials = object.provider.getContainerCredentials();
    api = new ContainerApi(credentials.apiUrl, credentials.token);
  }

  if (
    object.provider.serverless.service.functions &&
    Object.keys(object.provider.serverless.service.functions).length !== 0
  ) {
    const credentials = object.provider.getFunctionCredentials();
    api = new FunctionApi(credentials.apiUrl, credentials.token);
  }
  return api;
}

module.exports = {
  getApi,
};
