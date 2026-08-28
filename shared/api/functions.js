"use strict";

const { manageError } = require("./utils");

const LIST_PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 120;

module.exports = {
  listFunctions(namespaceId, page = 1, accumulated = []) {
    const functionsUrl = `namespaces/${namespaceId}/functions?page=${page}&page_size=${LIST_PAGE_SIZE}`;
    return this.apiManager
      .get(functionsUrl)
      .then((response) => {
        const functions = response.data.functions || [];
        const all = accumulated.concat(functions);

        if (functions.length < LIST_PAGE_SIZE) {
          return all;
        }

        return this.listFunctions(namespaceId, page + 1, all);
      })
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

  waitFunctionsAreDeployed(namespaceId, attempt = 1) {
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
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for functions in namespace ${namespaceId} to become ready`
          );
        }
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(this.waitFunctionsAreDeployed(namespaceId, attempt + 1)),
            POLL_INTERVAL_MS
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
  waitForFunctionStatus(functionId, wantedStatus, attempt = 1) {
    return this.getFunction(functionId)
      .then((func) => {
        if (func.status === "error") {
          throw new Error(func.name + ": " + func.error_message);
        }

        if (func.status !== wantedStatus) {
          if (attempt >= MAX_POLL_ATTEMPTS) {
            throw new Error(
              `Timed out waiting for function ${functionId} to reach status "${wantedStatus}"`
            );
          }
          return new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(
                  this.waitForFunctionStatus(
                    functionId,
                    wantedStatus,
                    attempt + 1
                  )
                ),
              POLL_INTERVAL_MS
            );
          });
        }

        return func;
      })
      .catch((err) => {
        // toleration on 404 only: some operations (e.g. checking status of
        // an item after deletion) will return a 404 once the item is gone.
        if (err.response === undefined) {
          // if we have a raw Error
          throw err;
        } else if (err.response.status !== 404) {
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
  waitDomainsAreDeployedFunction(functionId, attempt = 1) {
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
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for domains on function ${functionId} to become ready`
          );
        }
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                this.waitDomainsAreDeployedFunction(functionId, attempt + 1)
              ),
            POLL_INTERVAL_MS
          );
        });
      }
      return domains;
    });
  },
};
