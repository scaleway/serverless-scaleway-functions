'use strict';

const { manageError } = require('./utils');

module.exports = {
  listTriggersForApplication(applicationId) {
    const triggersUrl = `crons?application_id=${applicationId}`;
    return this.apiManager.get(triggersUrl)
      .then(response => response.data.crons)
      .catch(manageError);
  },

  createTrigger(applicationId, params) {
    return this.apiManager.post('crons', {
      ...params,
      application_id: applicationId,
    })
      .then(response => response.data)
      .catch(manageError);
  },

  updateTrigger(triggerId, params) {
    const updateUrl = `crons/${triggerId}`;
    return this.apiManager.patch(updateUrl, params)
      .then(response => response.data)
      .catch(manageError);
  },

  deleteTrigger(triggerId) {
    return this.apiManager.delete(`crons/${triggerId}`)
      .then(response => response.data)
      .catch(manageError);
  },
};
