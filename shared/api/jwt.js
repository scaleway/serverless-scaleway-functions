'use strict';

const { manageError } = require('./utils');

module.exports = {
  issueJwtNamespace(namespace_id, expiration_date) {
    const jwtUrl = `jwt/issue?namespace_id=${namespace_id}&expiration_date=${expiration_date}`;
    return this.apiManager.get(jwtUrl)
      .then(response => response.data || {})
      .catch(manageError);
  },

  issueJwtFunction(function_id, expiration_date) {
    const jwtUrl = `jwt/issue?function_id=${function_id}&expiration_date=${expiration_date}`;
    return this.apiManager.get(jwtUrl)
      .then(response => response.data || {})
      .catch(manageError);
  },

  issueJwtContainer(container_id, expiration_date) {
    const jwtUrl = `jwt/issue?container_id=${container_id}&expiration_date=${expiration_date}`;
    return this.apiManager.get(jwtUrl)
      .then(response => response.data || {})
      .catch(manageError);
  },
}
