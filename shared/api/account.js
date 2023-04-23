'use strict';

const { manageError } = require('./utils');

module.exports = {
  deleteProject(projectId) {
    return this.apiManager.delete(`${projectId}`)
      .catch(manageError);
  },

  createProject(params) {
    return this.apiManager.post("", params)
      .then(response => response.data)
      .catch(manageError);
  },
};
