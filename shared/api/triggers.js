"use strict";

const { manageError } = require("./utils");

module.exports = {
  async listTriggersForApplication(applicationId, isFunction) {
    let cronTriggersUrl = `crons?function_id=${applicationId}`;
    if (!isFunction) {
      cronTriggersUrl = `crons?container_id=${applicationId}`;
    }
    const cronTriggers = await this.apiManager
      .get(cronTriggersUrl)
      .then((response) => response.data.crons)
      .catch(manageError);

    const messageTriggers = await this.apiManager
      .get(`triggers?function_id=${applicationId}`)
      .then((response) => response.data.triggers)
      .catch(manageError);

    return [
      ...cronTriggers,
      ...messageTriggers
    ]
  },

  createCronTrigger(applicationId, isFunction, params) {
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

  createMessageTrigger(applicationId, params) {
    let payload = {
      ...params,
      function_id: applicationId,
    };

    return this.apiManager
      .post("triggers", payload)
      .then((response) => response.data)
      .catch(manageError);
  },

  updateCronTrigger(triggerId, params) {
    const updateUrl = `crons/${triggerId}`;
    return this.apiManager
      .patch(updateUrl, params)
      .then((response) => response.data)
      .catch(manageError);
  },

  deleteCronTrigger(triggerId) {
    return this.apiManager
      .delete(`crons/${triggerId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  deleteMessageTrigger(triggerId) {
    return this.apiManager
      .delete(`triggers/${triggerId}`)
      .then((response) => response.data)
      .catch(manageError);
  },
};
