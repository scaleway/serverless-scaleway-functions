"use strict";

const { manageError } = require("./utils");

module.exports = {
  issueJwtNamespace(namespaceId, expirationDate) {
    const jwtUrl = `issue-jwt?namespace_id=${namespaceId}&expiration_date=${expirationDate}`;
    return this.apiManager
      .get(jwtUrl)
      .then((response) => response.data || {})
      .catch(manageError);
  },

  issueJwtFunction(functionId, expirationDate) {
    const jwtUrl = `issue-jwt?function_id=${functionId}&expiration_date=${expirationDate}`;
    return this.apiManager
      .get(jwtUrl)
      .then((response) => response.data || {})
      .catch(manageError);
  },

  issueJwtContainer(containerId, expirationDate) {
    const jwtUrl = `issue-jwt?container_id=${containerId}&expiration_date=${expirationDate}`;
    return this.apiManager
      .get(jwtUrl)
      .then((response) => response.data || {})
      .catch(manageError);
  },
};
