"use strict";

const { manageError } = require("./utils");

module.exports = {
  listProjects(organizationId) {
    return this.apiManager
      .get(
        `?organization_id=${organizationId}&page_size=50&order_by=created_at_desc`
      )
      .then((response) => response.data.projects)
      .catch(manageError);
  },

  deleteProject(projectId) {
    return this.apiManager.delete(`${projectId}`).catch(manageError);
  },

  createProject(params) {
    return this.apiManager
      .post("", params)
      .then((response) => response.data)
      .catch(manageError);
  },
};
