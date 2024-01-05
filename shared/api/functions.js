"use strict";

const { manageError } = require("./utils");

module.exports = {
  listFunctions(namespaceId) {
    const functionsUrl = `namespaces/${namespaceId}/functions`;
    return this.apiManager
      .get(functionsUrl)
      .then((response) => response.data.functions || [])
      .catch(manageError);
  },

  createFunction(params) {
    return this.apiManager
      .post("functions", params)
      .then((response) => response.data)
      .catch(manageError);
  },

  updateFunction(functionId, params) {
    const updateUrl = `functions/${functionId}`;
    return this.apiManager
      .patch(updateUrl, params)
      .then((response) => response.data)
      .catch(manageError);
  },

  deployFunction(functionId, params) {
    return this.apiManager
      .post(`functions/${functionId}/deploy`, params)
      .then((response) => response.data)
      .catch(manageError);
  },

  getPresignedUrl(functionId, archiveSize) {
    return this.apiManager
      .get(`functions/${functionId}/upload-url?content_length=${archiveSize}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  /**
   * Deletes the function by functionId
   * @param {UUID} functionId
   * @returns function with status deleting.
   */
  deleteFunction(functionId) {
    return this.apiManager
      .delete(`functions/${functionId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  /**
   * Get function information by functionId
   * @param {UUID} functionId
   * @returns function.
   */
  getFunction(functionId) {
    return this.apiManager
      .get(`/functions/${functionId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  waitFunctionsAreDeployed(namespaceId) {
    return this.listFunctions(namespaceId).then((functions) => {
      let functionsAreReady = true;
      for (let i = 0; i < functions.length; i += 1) {
        const func = functions[i];
        if (func.status === "error") {
          throw new Error(func.error_message);
        }
        if (func.status !== "ready") {
          functionsAreReady = false;
          break;
        }
      }
      if (!functionsAreReady) {
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(this.waitFunctionsAreDeployed(namespaceId)),
            5000
          );
        });
      }
      return functions;
    });
  },

  /**
   *
   * @param {UUID} functionId id of the function to check
   * @param {String} wantedStatus wanted function status before leaving the wait status.
   * @returns
   */
  waitForFunctionStatus(functionId, wantedStatus) {
    return this.getFunction(functionId)
      .then((func) => {
        if (func.status === "error") {
          throw new Error(func.name + ": " + func.error_message);
        }

        if (func.status !== wantedStatus) {
          return new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(this.waitForFunctionStatus(functionId, wantedStatus)),
              5000
            );
          });
        }

        return func;
      })
      .catch((err) => {
        // toleration on 4XX errors because on some status, for exemple deleting the API
        // will return a 404 err code if item has been deleted.
        if (err.response === undefined) {
          // if we have a raw Error
          throw err;
        } else if (err.response.status >= 500) {
          // if we have a CustomError, we can check the status
          throw new Error(err);
        }
      });
  },

  /**
   * listDomains is used to read all domains of a wanted function.
   * @param {Number} functionId the id of the function to read domains.
   * @returns a Promise with request result.
   */
  listDomainsFunction(functionId) {
    const domainsUrl = `domains?function_id=${functionId}`;

    return this.apiManager
      .get(domainsUrl)
      .then((response) => response.data.domains)
      .catch(manageError);
  },

  /**
   * Waiting for all domains to be ready on a function
   * @param {UUID} functionId
   * @returns
   */
  waitDomainsAreDeployedFunction(functionId) {
    return this.listDomainsFunction(functionId).then((domains) => {
      let domainsAreReady = true;

      for (let i = 0; i < domains.length; i += 1) {
        const domain = domains[i];

        if (domain.status === "error") {
          throw new Error(domain.error_message);
        }

        if (domain.status !== "ready") {
          domainsAreReady = false;
          break;
        }
      }
      if (!domainsAreReady) {
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(this.waitDomainsAreDeployedFunction(functionId)),
            5000
          );
        });
      }
      return domains;
    });
  },
};
