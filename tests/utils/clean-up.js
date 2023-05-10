'use strict';

const { AccountApi, FunctionApi, ContainerApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');

const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);
const regions = ['fr-par', 'nl-ams', 'pl-waw'];

let projectId;

exports.removeProjectById = async (project) => {
  projectId = project;
  process.env.SCW_DEFAULT_PROJECT_ID = projectId;
  await removeAllTestNamespaces()
    .then(() => accountApi.deleteProject(projectId))
    .catch(() => console.log(`Executed at the wrong time for project ${projectId}`));
}

const removeAllTestNamespaces = async () => {
  for (const region of regions) {
    const functionApi = new FunctionApi(FUNCTIONS_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
    const functions = await functionApi.listNamespaces(projectId);
    for (const functionSrv of functions) {
      await functionApi.deleteNamespace(functionSrv.id)
        .then(async() => await functionApi.waitNamespaceIsDeleted(functionSrv.id))
        .catch();
    }

    const containerApi = new ContainerApi(CONTAINERS_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
    const containers = await containerApi.listNamespaces();
    for (const container of containers) {
      await containerApi.deleteNamespace(container.id)
        .then(async () => await containerApi.waitNamespaceIsDeleted(container.id))
        .catch();
    }
  }
}
