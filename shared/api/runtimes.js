"use strict";

const { manageError } = require("./utils");

module.exports = {
  listRuntimes() {
    const functionsUrl = `runtimes`;
    return this.apiManager
      .get(functionsUrl)
      .then((response) => response.data.runtimes || [])
      .catch(manageError);
  },
};
