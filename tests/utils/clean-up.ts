import {
  AccountApi,
  FunctionApi,
  ContainerApi,
  RegistryApi,
} from "../../shared/api";
import {
  ACCOUNT_API_URL,
  FUNCTIONS_API_URL,
  CONTAINERS_API_URL,
  REGISTRY_API_URL,
} from "../../shared/constants";

// shared/api/index.js (the AccountApi/FunctionApi/ContainerApi/RegistryApi
// class definitions themselves) is still CommonJS, deliberately deferred in
// the TypeScript migration - see docs/typescript-migration.md's open
// questions. That means these constructors and their instances resolve to
// `any` here; the interfaces below cover what this file's own logic reads
// off their results, not what the classes' methods actually return.
interface Project {
  id: string;
  name: string;
}

interface NamespaceRecord {
  id: string;
}

interface RegistryNamespaceRecord {
  id: string;
}

const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY!);
const regions = ["fr-par", "nl-ams", "pl-waw"];

const cleanup = async (): Promise<void> => {
  const accountApi = new AccountApi(
    ACCOUNT_API_URL,
    process.env.SCW_SECRET_KEY!,
  );
  const projects: Project[] = await accountApi.listProjects(
    process.env.SCW_ORGANIZATION_ID!,
  );
  for (const project of projects) {
    if (project.name.includes("test-slsframework-")) {
      process.env.SCW_DEFAULT_PROJECT_ID = project.id;
      await removeProjectById(project.id).catch(() => undefined);
    }
  }
};

const removeProjectById = async (projectId: string): Promise<void> => {
  process.env.SCW_DEFAULT_PROJECT_ID = projectId;
  await removeAllTestNamespaces(projectId)
    .then(() => accountApi.deleteProject(projectId))
    .catch(() => console.log(`failed to delete project ${projectId}`));
};

const removeAllTestNamespaces = async (projectId: string): Promise<void> => {
  for (const region of regions) {
    await removeFunctions(region, projectId).catch(() => undefined);
    await removeContainers(region, projectId).catch(() => undefined);
    await removeRegistryNamespaces(region, projectId).catch(() => undefined);
  }
};

const removeFunctions = async (
  region: string,
  projectId: string,
): Promise<void> => {
  const functionApi = new FunctionApi(
    FUNCTIONS_API_URL + `/${region}`,
    process.env.SCW_SECRET_KEY!,
  );
  const functions: NamespaceRecord[] =
    await functionApi.listNamespaces(projectId);
  for (const functionSrv of functions) {
    await functionApi
      .deleteNamespace(functionSrv.id)
      .then(
        async () => await functionApi.waitNamespaceIsDeleted(functionSrv.id),
      )
      .catch(() => undefined);
  }
};

const removeContainers = async (
  region: string,
  projectId: string,
): Promise<void> => {
  const containerApi = new ContainerApi(
    CONTAINERS_API_URL + `/${region}`,
    process.env.SCW_SECRET_KEY!,
  );
  const containers: NamespaceRecord[] =
    await containerApi.listNamespaces(projectId);
  for (const container of containers) {
    await containerApi
      .deleteNamespace(container.id)
      .then(async () => await containerApi.waitNamespaceIsDeleted(container.id))
      .catch(() => undefined);
  }
};

const removeRegistryNamespaces = async (
  region: string,
  projectId: string,
): Promise<void> => {
  const registryApi = new RegistryApi(
    REGISTRY_API_URL + `/${region}`,
    process.env.SCW_SECRET_KEY!,
  );
  const registries: RegistryNamespaceRecord[] =
    await registryApi.listRegistryNamespace(projectId);
  for (const registry of registries) {
    await registryApi
      .deleteRegistryNamespace(registry.id)
      .catch(() => undefined);
  }
};

export { removeProjectById, cleanup };
