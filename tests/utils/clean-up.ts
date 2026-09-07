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
import { requireNonEmpty } from "../../shared/api/params";

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
      await removeProjectById(project.id).catch(() => undefined);
    }
  }
};

// A falsy projectId must never reach the list/delete calls below: every
// list*() call here is Scaleway's own SDK-backed listing, and an
// empty/undefined project_id filter does NOT mean "match nothing" the way
// a well-formed but nonexistent project id does - it silently falls back
// to some other, unrelated real project's resources (verified live against
// the production API). Every caller of this function assigns projectId
// from an async project-creation call inside its own beforeAll, so a
// transient failure there (network error, a transient 403, etc.) leaves
// projectId undefined when Jest still runs afterAll - which is exactly how
// a live-test failure once caused this function to delete real,
// non-test registry namespaces in an unrelated project.
//
// requireNonEmpty() is also enforced independently inside every
// shared/api/*.ts function this eventually calls (listNamespaces,
// listRegistryNamespace, deleteProject, ...), so this check is
// belt-and-suspenders - but it's the one that lets cleanup log a clear
// reason and skip entirely, rather than letting the failure surface deep
// inside removeAllTestNamespaces's per-region try/catch.
const removeProjectById = async (projectId: string): Promise<void> => {
  try {
    requireNonEmpty(projectId, "projectId");
  } catch (err) {
    console.error(
      `removeProjectById: ${(err as Error).message} - refusing to act.`,
    );
    return;
  }
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
