"use strict";

const { manageError } = require("./utils");

module.exports = {
  listNamespaces(projectId) {
    const projectIdReq =
      projectId === undefined ? "" : `&project_id=${projectId}`;
    return this.apiManager
      .get(`namespaces?page_size=100${projectIdReq}`)
      .then((response) => response.data.namespaces || [])
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

  waitNamespaceIsReady(namespaceId) {
    return this.getNamespace(namespaceId).then((namespace) => {
      if (namespace.status === "error") {
        throw new Error(namespace.error_message);
      }
      if (namespace.status !== "ready") {
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(this.waitNamespaceIsReady(namespaceId)),
            1000
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

  waitNamespaceIsDeleted(namespaceId) {
    return this.getNamespace(namespaceId)
      .then((response) => {
        if (response && response.status === "deleting") {
          return new Promise((resolve) => {
            setTimeout(
              () => resolve(this.waitNamespaceIsDeleted(namespaceId)),
              1000
            );
          });
        }
        return true;
      })
      .catch((err) => {
        if (err.response && err.response.status === 404) {
          return true;
        }
        throw new Error("An error occured during namespace deletion");
      });
  },
};
