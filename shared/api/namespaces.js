"use strict";

const { manageError } = require("./utils");

const LIST_PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 1000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 600;

module.exports = {
  listNamespaces(projectId, page = 1, accumulated = []) {
    const projectIdReq =
      projectId === undefined ? "" : `&project_id=${projectId}`;
    return this.apiManager
      .get(`namespaces?page=${page}&page_size=${LIST_PAGE_SIZE}${projectIdReq}`)
      .then((response) => {
        const namespaces = response.data.namespaces || [];
        const all = accumulated.concat(namespaces);

        if (namespaces.length < LIST_PAGE_SIZE) {
          return all;
        }

        return this.listNamespaces(projectId, page + 1, all);
      })
      .catch(manageError);
  },

  getNamespaceFromList(namespaceName, projectId) {
    const projectIdReq =
      projectId === undefined ? "" : `&project_id=${projectId}`;
    // query Scaleway API to check if space exists
    return this.apiManager
      .get(`namespaces?name=${namespaceName}${projectIdReq}`)
      .then((response) => {
        const { namespaces } = response.data;
        return namespaces[0];
      })
      .catch(manageError);
  },

  getNamespace(namespaceId) {
    return this.apiManager
      .get(`namespaces/${namespaceId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  waitNamespaceIsReady(namespaceId, attempt = 1) {
    return this.getNamespace(namespaceId).then((namespace) => {
      if (namespace.status === "error") {
        throw new Error(namespace.error_message);
      }
      if (namespace.status !== "ready") {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for namespace ${namespaceId} to become ready`,
          );
        }
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(this.waitNamespaceIsReady(namespaceId, attempt + 1)),
            POLL_INTERVAL_MS,
          );
        });
      }
      return namespace;
    });
  },

  createNamespace(params) {
    return this.apiManager
      .post("namespaces", params)
      .then((response) => response.data)
      .catch(manageError);
  },

  updateNamespace(namespaceId, params) {
    return this.apiManager
      .patch(`namespaces/${namespaceId}`, params)
      .catch(manageError);
  },

  deleteNamespace(namespaceId) {
    return this.apiManager
      .delete(`namespaces/${namespaceId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  waitNamespaceIsDeleted(namespaceId, attempt = 1) {
    return this.getNamespace(namespaceId)
      .then((response) => {
        if (response && response.status === "deleting") {
          if (attempt >= MAX_POLL_ATTEMPTS) {
            throw new Error(
              `Timed out waiting for namespace ${namespaceId} to be deleted`,
            );
          }
          return new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(this.waitNamespaceIsDeleted(namespaceId, attempt + 1)),
              POLL_INTERVAL_MS,
            );
          });
        }
        return true;
      })
      .catch((err) => {
        if (err.response && err.response.status === 404) {
          return true;
        }
        throw new Error(
          `An error occured during namespace deletion: ${err.message}`,
        );
      });
  },
};
