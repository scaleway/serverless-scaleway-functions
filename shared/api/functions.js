'use strict';

const { manageError } = require('./index');

module.exports = {
  listFunctions(namespaceId) {
    const functionsUrl = `namespaces/${namespaceId}/functions`;
    return this.apiManager.get(functionsUrl)
      .then(response => response.data.functions || [])
      .catch(manageError);
  },

  createFunction(params) {
    return this.apiManager.post('functions', params)
      .then(response => response.data)
      .catch(manageError);
  },

  updateFunction(functionId, params) {
    const updateUrl = `functions/${functionId}`;
    return this.apiManager.patch(updateUrl, params)
      .then(response => response.data)
      .catch(manageError);
  },

  deployFunction(functionId, params) {
    return this.apiManager.post(`functions/${functionId}/deploy`, params)
      .then(response => response.data)
      .catch(manageError);
  },

  getPresignedUrl(functionId, archiveSize) {
    return this.apiManager.get(`/functions/${functionId}/upload-url?content_length=${archiveSize}`)
      .then(response => response.data)
      .catch(manageError);
  },

  waitFunctionsAreDeployed(namespaceId) {
    return this.listFunctions(namespaceId)
      .then((functions) => {
        let functionsAreReady = true;
        for (let i = 0; i < functions.length; i += 1) {
          const func = functions[i];
          if (func.status === 'error') {
            throw new Error(func.error_message);
          }
          if (func.status !== 'ready') {
            functionsAreReady = false;
            break;
          }
        }
        if (!functionsAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitFunctionsAreDeployed(namespaceId)), 5000);
          });
        }
        return functions;
      });
  },
};
