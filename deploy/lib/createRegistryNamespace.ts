// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import RegistryApi = require("../../shared/api/registry");
import ScalewayProvider = require("../../provider/scalewayProvider");
import type { Serverless } from "../../shared/serverlessTypes";
import { Errors } from "@scaleway/sdk-client";

interface RegistryNamespaceRecord {
  id: string;
  name: string;
  endpoint: string;
  [key: string]: unknown;
}

interface ContainerConfig {
  directory?: string;
  registryImage?: string;
  [key: string]: unknown;
}

interface RegistryApiLike {
  listRegistryNamespace(projectId: string): Promise<RegistryNamespaceRecord[]>;
  createRegistryNamespace(params: {
    name: string;
    project_id: string;
  }): Promise<RegistryNamespaceRecord>;
}

interface EnsureRegistryNamespaceContext {
  serverless: Serverless;
  provider: ScalewayProvider;
  namespaceName: string;
  namespace: { registry_endpoint?: string; [key: string]: unknown };
}

// v1 stopped auto-creating a Container Registry namespace alongside a
// Containers namespace (confirmed via Scaleway's v1 migration guide), so
// this repo now has to do it itself - but only when something actually
// needs it: a container being built locally (`directory`) always pushes to
// this namespace's endpoint regardless of any custom image, and a container
// with no explicit `registryImage` falls back to it too (see
// createContainers.ts's createSingleContainer/updateSingleContainer). A
// service where every container brings its own external image has no use
// for one.
function needsRegistryNamespace(
  containers: Record<string, ContainerConfig> | undefined,
): boolean {
  if (!containers) return false;
  return Object.values(containers).some(
    (container) =>
      container.directory !== undefined || !container.registryImage,
  );
}

// Registry namespace names are unique per-region *across every Scaleway
// organization* (confirmed via the SDK's own doc comment: "unique in a
// region across all organizations"), unlike Containers namespace names
// (unique within a project only) - so reusing the containers namespace's
// own name can occasionally collide with an unrelated project. This
// fallback is deterministic (derived from the project ID, not random) so
// it can be recomputed - and found again - on every deploy without storing
// any new local or remote state.
function shortProjectSuffix(projectId: string): string {
  return projectId.replace(/-/g, "").slice(0, 8);
}

async function findRegistryNamespaceByName(
  registryApi: RegistryApiLike,
  projectId: string,
  name: string,
): Promise<RegistryNamespaceRecord | undefined> {
  const namespaces = await registryApi.listRegistryNamespace(projectId);
  return namespaces.find((namespace) => namespace.name === name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PERMISSIONS_RETRY_INTERVAL_MS = 5000;
const PERMISSIONS_RETRY_MAX_ATTEMPTS = 3;

// A 403 here (as opposed to the 409-name-conflict case just above) was
// originally assumed to be IAM policy propagation lag on a brand-new
// project, and retried for a full ~60s on that theory. Verified live
// (2026-08-28) that this is wrong: against a project whose IAM policy
// actually grants Registry access, namespace creation succeeds on the very
// first attempt, seconds after the project itself is created - there is no
// inherent settle time. A 403 here means the credentials' IAM policy simply
// doesn't cover the Registry API for this project (e.g. a policy scoped to
// a fixed list of pre-existing projects rather than "all projects, current
// and future") - retrying alone cannot fix that; it needs the policy
// itself corrected. This short retry is kept only as cheap insurance
// against a genuinely transient error (e.g. a request that raced the
// project becoming fully queryable by other Scaleway services right after
// creation), not as a wait-out-propagation mechanism.
async function createRegistryNamespaceWithRetry(
  registryApi: RegistryApiLike,
  params: { name: string; project_id: string },
  log: (message: string) => void,
  attempt = 1,
): Promise<RegistryNamespaceRecord> {
  try {
    return await registryApi.createRegistryNamespace(params);
  } catch (err) {
    const isRetryablePermissionsError =
      err instanceof Errors.ScalewayError &&
      err.status === 403 &&
      attempt < PERMISSIONS_RETRY_MAX_ATTEMPTS;
    if (!isRetryablePermissionsError) {
      throw err;
    }
    log(
      `Registry namespace creation was denied - retrying in ${PERMISSIONS_RETRY_INTERVAL_MS / 1000}s in case this is transient (attempt ${attempt}/${PERMISSIONS_RETRY_MAX_ATTEMPTS}); if this persists, check that the credentials' IAM policy grants Container Registry permissions on this project...`,
    );
    await sleep(PERMISSIONS_RETRY_INTERVAL_MS);
    return createRegistryNamespaceWithRetry(
      registryApi,
      params,
      log,
      attempt + 1,
    );
  }
}

// The actual find-or-create logic, taking its dependencies as plain
// parameters rather than off `this` - kept separate from
// ensureRegistryNamespace() below so it's directly unit-testable against a
// fake registryApi, the same "expose the interesting pure logic" split
// buildAndPushContainers.ts and createContainers.ts already use for their
// own non-enumerable-exported helpers.
async function resolveRegistryNamespace(
  registryApi: RegistryApiLike,
  projectId: string,
  primaryName: string,
  log: (message: string) => void,
): Promise<RegistryNamespaceRecord> {
  const fallbackName = `${primaryName}-${shortProjectSuffix(projectId)}`;

  const existing =
    (await findRegistryNamespaceByName(registryApi, projectId, primaryName)) ||
    (await findRegistryNamespaceByName(registryApi, projectId, fallbackName));
  if (existing) return existing;

  log(`Creating registry namespace ${primaryName}...`);
  try {
    return await createRegistryNamespaceWithRetry(
      registryApi,
      { name: primaryName, project_id: projectId },
      log,
    );
  } catch (err) {
    // Only retry with the fallback name on a real name conflict (409) -
    // verified against the live API (2026-08-27) that other ScalewayErrors
    // happen here too (e.g. 403 PermissionsDeniedError, already retried a
    // few times above as a possible transient error rather than a naming
    // issue) and must NOT be treated as "name unavailable, try the
    // fallback": that both wastes a
    // second API call that's guaranteed to fail the same way, and produces
    // a misleading log message about the actual cause. The exact status a
    // genuine name-taken-by-another-organization conflict returns hasn't
    // itself been directly observed yet - 409 is the standard REST
    // convention and everything confirmed so far (403) is consistent with
    // excluding it, but this should be re-checked if a real conflict is
    // ever hit and it turns out to use a different status.
    if (!(err instanceof Errors.ScalewayError) || err.status !== 409) {
      throw err;
    }
    log(
      `Registry namespace name ${primaryName} is unavailable, retrying as ${fallbackName}...`,
    );
    return createRegistryNamespaceWithRetry(
      registryApi,
      { name: fallbackName, project_id: projectId },
      log,
    );
  }
}

export async function ensureRegistryNamespace(
  this: EnsureRegistryNamespaceContext,
): Promise<void> {
  const containers = this.provider.serverless.service.custom
    ?.containers as unknown as Record<string, ContainerConfig> | undefined;

  if (!needsRegistryNamespace(containers)) {
    return;
  }

  const registryApi = new RegistryApi(
    this.provider.registryApiUrl!,
    this.provider.scwToken!,
  ) as unknown as RegistryApiLike;

  const namespace = await resolveRegistryNamespace(
    registryApi,
    this.provider.getScwProject()!,
    this.namespaceName,
    (message) => this.serverless.cli.log(message),
  );

  this.namespace.registry_endpoint = namespace.endpoint;
}

// Exposed non-enumerably so tests can reach these pure helpers directly via
// require() instead of rewire()'s __get__ - see the identical comment in
// deploy/lib/createContainers.ts for why. Non-enumerable so Object.assign
// (this, ...) in deploy/scalewayDeploy.ts's mixin doesn't pick these up.
Object.defineProperties(exports, {
  needsRegistryNamespace: { value: needsRegistryNamespace, enumerable: false },
  shortProjectSuffix: { value: shortProjectSuffix, enumerable: false },
  resolveRegistryNamespace: {
    value: resolveRegistryNamespace,
    enumerable: false,
  },
  createRegistryNamespaceWithRetry: {
    value: createRegistryNamespaceWithRetry,
    enumerable: false,
  },
});
