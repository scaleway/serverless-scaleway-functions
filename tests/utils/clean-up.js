"use strict";

const {
  AccountApi,
  FunctionApi,
  ContainerApi,
  RegistryApi,
} = require("../../shared/api");
const {
  ACCOUNT_API_URL,
  FUNCTIONS_API_URL,
  CONTAINERS_API_URL,
  REGISTRY_API_URL,
} = require("../../shared/constants");

const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);
const regions = ["fr-par", "nl-ams", "pl-waw"];

const cleanup = async () => {
  // Only this run's projects: CI runs for different PRs share one
  // organization, so deleting every test-slsframework-* project would wipe
  // out test projects that another, still-running workflow is using.
  // CI sets SCW_TEST_RUN_ID once per workflow run (.github/workflows/test.yml)
  // and createProject() puts it in every project name.
  const runId = process.env.SCW_TEST_RUN_ID;
  if (!runId) {
    console.error(
      "cleanup: SCW_TEST_RUN_ID is not set - refusing to delete projects that other runs may be using."
    );
    return;
  }
  const runPrefix = `test-slsframework-${runId}-`;
  const accountApi = new AccountApi(
    ACCOUNT_API_URL,
    process.env.SCW_SECRET_KEY
  );
  const projects = await accountApi.listProjects(
    process.env.SCW_ORGANIZATION_ID
  );
  for (const project of projects) {
    if (project.name.startsWith(runPrefix)) {
      process.env.SCW_DEFAULT_PROJECT_ID = project.id;
      await removeProjectById(project.id).catch();
    }
  }
};

const removeProjectById = async (projectId) => {
  // Never act without a project id: Scaleway's list endpoints treat a
  // missing project_id filter as unscoped rather than "match nothing", so
  // the deletes below would hit namespaces in other, unrelated projects.
  // projectId is undefined whenever createProject() failed in a test's
  // beforeAll, and Jest still runs afterAll.
  if (!projectId) {
    console.error("removeProjectById: no projectId given - refusing to act.");
    return;
  }
  process.env.SCW_DEFAULT_PROJECT_ID = projectId;
  await removeAllTestNamespaces(projectId)
    .then(() => accountApi.deleteProject(projectId))
    .catch(() => console.log(`failed to delete project ${projectId}`));
};

module.exports = { removeProjectById, cleanup };

const removeAllTestNamespaces = async (projectId) => {
  for (const region of regions) {
    await removeFunctions(region, projectId).catch();
    await removeContainers(region, projectId).catch();
    await removeRegistryNamespaces(region, projectId).catch();
  }
};

const removeFunctions = async (region, projectId) => {
  const functionApi = new FunctionApi(
    FUNCTIONS_API_URL + `/${region}`,
    process.env.SCW_SECRET_KEY
  );
  const functions = await functionApi.listNamespaces(projectId);
  for (const functionSrv of functions) {
    await functionApi
      .deleteNamespace(functionSrv.id)
      .then(
        async () => await functionApi.waitNamespaceIsDeleted(functionSrv.id)
      )
      .catch();
  }
};

const removeContainers = async (region, projectId) => {
  const containerApi = new ContainerApi(
    CONTAINERS_API_URL + `/${region}`,
    process.env.SCW_SECRET_KEY
  );
  const containers = await containerApi.listNamespaces(projectId);
  for (const container of containers) {
    await containerApi
      .deleteNamespace(container.id)
      .then(async () => await containerApi.waitNamespaceIsDeleted(container.id))
      .catch();
  }
};

const removeRegistryNamespaces = async (region, projectId) => {
  const registryApi = new RegistryApi(
    REGISTRY_API_URL + `/${region}`,
    process.env.SCW_SECRET_KEY
  );
  const registries = await registryApi.listRegistryNamespace(projectId);
  for (const registry of registries) {
    await registryApi.deleteRegistryNamespace(registry.id).catch();
  }
};
