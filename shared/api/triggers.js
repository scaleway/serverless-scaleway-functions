"use strict";

const { manageError } = require("./utils");

module.exports = {
  listTriggersForApplication(applicationId, isFunction) {
    let triggersUrl = `crons?function_id=${applicationId}`;
    if (!isFunction) {
      triggersUrl = `crons?container_id=${applicationId}`;
    }
    return this.apiManager
      .get(triggersUrl)
      .then((response) => response.data.crons)
      .catch(manageError);
  },

  createTrigger(applicationId, isFunction, params) {
    let payload = {
      ...params,
      function_id: applicationId,
    };

    if (!isFunction) {
      payload = {
        ...params,
        container_id: applicationId,
      };
    }
    return this.apiManager
      .post("crons", payload)
      .then((response) => response.data)
      .catch(manageError);
  },

  updateTrigger(triggerId, params) {
    const updateUrl = `crons/${triggerId}`;
    return this.apiManager
      .patch(updateUrl, params)
      .then((response) => response.data)
      .catch(manageError);
  },

  deleteTrigger(triggerId) {
    return this.apiManager
      .delete(`crons/${triggerId}`)
      .then((response) => response.data)
      .catch(manageError);
  },
};
