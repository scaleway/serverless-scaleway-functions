'use strict';

const { manageError } = require('./utils');

module.exports = {
   getLines(applicationId) {
    const logsUrl = `logs?application_id=${applicationId}`;
    return this.apiManager.get(logsUrl)
      .then(response => response.data.logs || [])
      .catch(manageError);
  },
};
