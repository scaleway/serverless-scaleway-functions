"use strict";

const { manageError } = require("./utils");

module.exports = {
  getLines(application) {
    let logsUrl = `functions/${application.id}/logs`;
    if (!application.runtime) {
      logsUrl = `containers/${application.id}/logs`;
    }
    return this.apiManager
      .get(logsUrl)
      .then((response) => response.data.logs || [])
      .catch(manageError);
  },
};
