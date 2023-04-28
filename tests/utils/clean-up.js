'use strict';

const { AccountApi, FunctionApi, ContainerApi, RegistryApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');

const removeAllTestProjects = async () => {
  const projects = await accountApi.listProjects(process.env.SCW_ORGANIZATION_ID);
  for (const project of projects) {
    if (project.name.includes('test-slsframework-')) {
      process.env.SCW_DEFAULT_PROJECT_ID = project.id;
      try {
        await removeAllTestNamespaces();
        accountApi.deleteProject(project.id);
      } catch (err) {
        console.log(err)
      }
    }
  }
}
const removeAllTestNamespaces = async () => {
  const functions = await functionApi.listNamespaces();
  for (const functionSrv of functions) {
    try {
      await functionApi.deleteNamespace(functionSrv.id);
      await functionApi.waitNamespaceIsDeleted(functionSrv.id);
    } catch (err) {
      console.log(err)
    }
  }
  const containers = await containerApi.listNamespaces();
  for (const container of containers) {
    try {
      await containerApi.deleteNamespace(container.id);
      await containerApi.waitNamespaceIsDeleted(container.id);
    } catch (err) {
      console.log(err)
    }
  }

  const registries = await registryApi.listRegistryNamespace();
  for (const registry of registries) {
    try {
      await registryApi.deleteRegistryNamespace(registry.id);
    } catch (err) {
      console.log(err)
    }
  }
}

const functionApi = new FunctionApi(FUNCTIONS_API_URL+`/${process.env.SCW_REGION}`, process.env.SCW_SECRET_KEY);
const containerApi = new ContainerApi(CONTAINERS_API_URL+`/${process.env.SCW_REGION}`, process.env.SCW_SECRET_KEY);
const registryApi = new RegistryApi(REGISTRY_API_URL+`/${process.env.SCW_REGION}`, process.env.SCW_SECRET_KEY)
const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);

removeAllTestProjects();

module.exports = {
  removeAllTestProjects,
};
