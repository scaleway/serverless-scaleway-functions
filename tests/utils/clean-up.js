'use strict';

const { AccountApi, FunctionApi, ContainerApi, RegistryApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');

const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);
const regions = ['fr-par', 'nl-ams', 'pl-waw'];

const cleanup = async () => {
  const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);
  const projects = await accountApi.listProjects(process.env.SCW_ORGANIZATION_ID);
  for (const project of projects) {
    if (project.name.includes('test-slsframework-')) {
      process.env.SCW_DEFAULT_PROJECT_ID = project.id;
      await removeProjectById(project.id)
        .catch();
    }
  }
}

const removeProjectById = async (projectId) => {
  process.env.SCW_DEFAULT_PROJECT_ID = projectId;
  await removeAllTestNamespaces(projectId)
    .then(() => accountApi.deleteProject(projectId))
    .catch(() => console.log(`failed to delete project ${projectId}`));
}

module.exports = { removeProjectById, cleanup };

const removeAllTestNamespaces = async (projectId) => {
  for (const region of regions) {
    await removeFunctions(region, projectId).catch();
    await removeContainers(region, projectId).catch();
    await removeRegistryNamespaces(region, projectId).catch();
  }
}

const removeFunctions = async(region, projectId) => {
  const functionApi = new FunctionApi(FUNCTIONS_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
  const functions = await functionApi.listNamespaces(projectId);
  for (const functionSrv of functions) {
    await functionApi.deleteNamespace(functionSrv.id)
      .then(async() => await functionApi.waitNamespaceIsDeleted(functionSrv.id))
      .catch();
  }
}

const removeContainers = async(region, projectId) => {
  const containerApi = new ContainerApi(CONTAINERS_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
  const containers = await containerApi.listNamespaces(projectId);
  for (const container of containers) {
    await containerApi.deleteNamespace(container.id)
      .then(async () => await containerApi.waitNamespaceIsDeleted(container.id))
      .catch();
  }
}

const removeRegistryNamespaces = async(region, projectId) => {
  const registryApi = new RegistryApi(REGISTRY_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
  const registries = await registryApi.listRegistryNamespace(projectId);
  for (const registry of registries) {
    await registryApi.deleteRegistryNamespace(registry.id)
      .catch();
  }
}
