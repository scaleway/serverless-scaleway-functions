'use strict';

const { AccountApi, FunctionApi, ContainerApi, RegistryApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');

const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);
const regions = ['fr-par', 'nl-ams', 'pl-waw'];

let projectId;

const removeAllTestProjects = async () => {
  const projects = await accountApi.listProjects(process.env.SCW_ORGANIZATION_ID);
  for (const project of projects) {
    if (project.name.includes('test-slsframework-')) {
      projectId = project.id;
      process.env.SCW_DEFAULT_PROJECT_ID = projectId;
      try {
        await removeProjectById(projectId);
      } catch (err) {
      }
    }
  }
}

const removeProjectById = async (projectId) => {
  process.env.SCW_DEFAULT_PROJECT_ID = projectId;
  try {
    await removeAllTestNamespaces();
    accountApi.deleteProject(projectId);
  } catch (err) {
  }
}

const removeAllTestNamespaces = async () => {
  for (const region of regions) {
    const functionApi = new FunctionApi(FUNCTIONS_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
    const functions = await functionApi.listNamespaces(projectId);
    for (const functionSrv of functions) {
      try {
        await functionApi.deleteNamespace(functionSrv.id);
        await functionApi.waitNamespaceIsDeleted(functionSrv.id);
      } catch (err) {
      }
    }

    const containerApi = new ContainerApi(CONTAINERS_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
    const containers = await containerApi.listNamespaces();
    for (const container of containers) {
      try {
        await containerApi.deleteNamespace(container.id);
        await containerApi.waitNamespaceIsDeleted(container.id);
      } catch (err) {
      }
    }

    const registryApi = new RegistryApi(REGISTRY_API_URL + `/${region}`, process.env.SCW_SECRET_KEY);
    const registries = await registryApi.listRegistryNamespace();
    for (const registry of registries) {
      try {
        await registryApi.deleteRegistryNamespace(registry.id);
      } catch (err) {
      }
    }
  }
}

removeAllTestProjects();

module.exports = {
  removeAllTestProjects, removeProjectById
};
