import { Errors } from "@scaleway/sdk-client";

// Containerv1's Container type - see the long comment above toLegacyContainer
// for the full v1beta1 -> v1 field mapping this shape reflects.
interface SdkContainer {
  id: string;
  name: string;
  status: string;
  errorMessage?: string;
  publicEndpoint: string;
  privateNetworkId?: string;
  httpsConnectionsOnly: boolean;
  image: string;
  secretEnvironmentVariables: Record<string, string>;
  mvcpuLimit: number;
  memoryLimitBytes: number;
}

interface SdkDomain {
  id: string;
  hostname: string;
  status: string;
  errorMessage?: string;
}

interface ContainerSdkApi {
  listContainers(request?: { namespaceId?: string }): Promise<{
    containers: SdkContainer[];
  }> & {
    all(): Promise<SdkContainer[]>;
  };
  createContainer(request: Record<string, unknown>): Promise<SdkContainer>;
  updateContainer(request: Record<string, unknown>): Promise<SdkContainer>;
  // v1 renamed deployContainer -> redeployContainer (create/update now always
  // deploy on their own, so this is only needed for the explicit "force a
  // rollout" case) - see deployContainer() below, which keeps its own
  // exported name for deploy/lib/deployContainers.ts's sake.
  redeployContainer(request: { containerId: string }): Promise<SdkContainer>;
  deleteContainer(request: { containerId: string }): Promise<SdkContainer>;
  getContainer(request: { containerId: string }): Promise<SdkContainer>;
  listDomains(request: {
    containerId: string;
  }): Promise<{ domains: SdkDomain[] }>;
}

interface ContainerSdkContext {
  sdkApi: ContainerSdkApi;
}

interface WaitContainersAreDeployedContext extends ContainerSdkContext {
  waitContainersAreDeployed(
    namespaceId: string,
    attempt?: number,
  ): Promise<ContainerRecord[]>;
}

interface WaitForContainerContext extends ContainerSdkContext {
  getContainer(containerId: string): Promise<ContainerRecord>;
  waitForContainer(
    containerId: string,
    attempt?: number,
  ): Promise<ContainerRecord | undefined>;
}

interface WaitDomainsAreDeployedContainerContext extends ContainerSdkContext {
  listDomainsContainer(containerId: string): Promise<DomainRecord[]>;
  waitDomainsAreDeployedContainer(
    containerId: string,
    attempt?: number,
  ): Promise<DomainRecord[]>;
}

// External shape this file has always returned (snake_case fields
// deploy/lib/createContainers.ts, deploy/lib/deployContainers.ts and
// buildAndPushContainers.ts read directly: domain_name,
// private_network_id, secret_environment_variables) - preserved via
// aliasing rather than changing every consumer, same pattern as
// functions.ts/namespaces.ts. This is also where v1's breaking field
// changes get absorbed so no caller needs to change:
//   - domainName -> publicEndpoint (still surfaced as domain_name)
//   - registryImage -> image (still surfaced as registry_image)
//   - httpOption ('enabled'|'redirected' string) -> httpsConnectionsOnly
//     (boolean) - not a bijective mapping (the old 'redirected' value
//     301-redirected HTTP to HTTPS rather than rejecting it outright), but
//     httpsConnectionsOnly: true is the closest available v1 semantic for
//     "only HTTPS should reach the container", so 'redirected' -> true and
//     anything else (including unset, matching the old default) -> false.
//   - secretEnvironmentVariables: {key,hashedValue}[] -> Record<string,string>
//   - memoryLimit (MB) -> memoryLimitBytes (bytes)
//   - cpuLimit -> mvcpuLimit (same mvCPU unit, rename only)
//   - maxConcurrency: removed outright in v1 (already deprecated pre-v1 -
//     see deploy/lib/createContainers.ts's maxConcurrencyDeprecationWarning)
//     - simply never forwarded to the SDK call, params.max_concurrency stays
//     accepted here so that file's warning logic needs no change.
interface ContainerRecord {
  id: string;
  name: string;
  status: string;
  error_message?: string;
  domain_name?: string;
  private_network_id?: string;
  http_option?: string;
  registry_image?: string;
  secret_environment_variables?: { key: string; hashed_value: string }[];
  memory_limit?: number;
  cpu_limit?: number;
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  status: string;
  error_message?: string;
  [key: string]: unknown;
}

const BYTES_PER_MB = 1024 * 1024;

function toLegacyHttpOption(
  httpsConnectionsOnly: boolean | undefined,
): string | undefined {
  if (httpsConnectionsOnly === undefined) return undefined;
  return httpsConnectionsOnly ? "redirected" : "enabled";
}

function toSdkHttpsConnectionsOnly(httpOption: unknown): boolean | undefined {
  if (httpOption === undefined) return undefined;
  return httpOption === "redirected";
}

function toLegacyContainer(container: SdkContainer): ContainerRecord {
  return {
    ...container,
    error_message: container.errorMessage,
    domain_name: container.publicEndpoint,
    private_network_id: container.privateNetworkId,
    http_option: toLegacyHttpOption(container.httpsConnectionsOnly),
    registry_image: container.image,
    secret_environment_variables: container.secretEnvironmentVariables
      ? Object.entries(container.secretEnvironmentVariables).map(
          ([key, hashed_value]) => ({ key, hashed_value }),
        )
      : undefined,
    memory_limit: container.memoryLimitBytes
      ? Math.round(container.memoryLimitBytes / BYTES_PER_MB)
      : undefined,
    cpu_limit: container.mvcpuLimit,
  };
}

function toLegacyDomain(domain: SdkDomain): DomainRecord {
  return { ...domain, error_message: domain.errorMessage };
}

// deploy/lib/createContainers.ts's adaptHealthCheckToAPI/
// adaptScalingOptionToAPI build these two nested objects with the old raw
// REST API's snake_case field names (failure_threshold,
// concurrent_requests_threshold, etc.) - translate to the SDK's camelCase
// equivalents here, at the API boundary, rather than touching that file
// (same "preserve caller, translate internally" approach as everywhere
// else in this migration). http/tcp probe sub-objects need no renaming -
// {path} and {} already match the SDK's shape exactly.
//
// v1 split the old single `healthCheck` into `livenessProbe` (new, ongoing
// runtime restarts) and `startupProbe` (only checked while the container is
// starting, aborting the deployment on failure). The old healthCheck's
// behavior - abort deployment if the check fails during startup - matches
// startupProbe's documented semantics, so that's what this repo's single
// `healthCheck:` config maps onto; there is no serverless.yml surface for
// livenessProbe (not a breaking change, just not exposed yet).
// Verified directly against the live v1 API (2026-08-27): even though the
// SDK's own generated type marks ContainerProbe.timeout as optional,
// creating a container with a startupProbe and no timeout is rejected with
// "invalid argument(s): startup_probe.timeout is required, value is
// required" - there's no serverless.yml config surface for this (the old
// healthCheck never had a timeout field either), so a fixed default is used.
const DEFAULT_STARTUP_PROBE_TIMEOUT = "1s";

function toSdkStartupProbe(
  healthCheck: unknown,
): Record<string, unknown> | undefined {
  if (!healthCheck || typeof healthCheck !== "object") return undefined;
  const hc = healthCheck as Record<string, unknown>;
  return {
    failureThreshold: hc.failure_threshold,
    interval: hc.interval,
    timeout: DEFAULT_STARTUP_PROBE_TIMEOUT,
    http: hc.http,
    tcp: hc.tcp,
  };
}

function toSdkScalingOption(
  scalingOption: unknown,
): Record<string, unknown> | undefined {
  if (!scalingOption || typeof scalingOption !== "object") return undefined;
  const so = scalingOption as Record<string, unknown>;
  return {
    concurrentRequestsThreshold: so.concurrent_requests_threshold,
    cpuUsageThreshold: so.cpu_usage_threshold,
    memoryUsageThreshold: so.memory_usage_threshold,
  };
}

const POLL_INTERVAL_MS = 5000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 120;

const CONTAINERS_FINAL_STATUSES = ["ready", "error", "locked"];

export async function listContainers(
  this: ContainerSdkContext,
  namespaceId: string,
): Promise<ContainerRecord[]> {
  const containers = await this.sdkApi.listContainers({ namespaceId }).all();
  return containers.map(toLegacyContainer);
}

function toSdkMemoryLimitBytes(memoryLimitMb: unknown): number | undefined {
  return typeof memoryLimitMb === "number"
    ? memoryLimitMb * BYTES_PER_MB
    : undefined;
}

// deploy/lib/createContainers.ts builds this via
// secrets.convertObjectToModelSecretsArray()/secrets.mergeSecretEnvVars() -
// an array of {key, value} (create) or {key, value: string|null} (update,
// where null means "removed") - matching v1beta1's Secret[] request shape.
// v1's CreateContainerRequest/UpdateContainerRequest instead take a plain
// Record<string,string> with zero shape translation on the wire (verified
// against the real generated marshaller, which does a bare
// `secret_environment_variables: request.secretEnvironmentVariables`
// passthrough) - so the array has to be converted here.
//
// A Record<string,string> has no way to carry update's "value: null" removal
// signal, so a null-valued entry is simply dropped from the map rather than
// forwarded. Whether that's actually correct depends on whether v1's update
// treats an included secretEnvironmentVariables map as "replace the whole
// map" (in which case dropping a key here does delete it - correct) or as a
// per-key merge (in which case a removed secret would keep lingering
// server-side instead of being deleted) - not yet confirmed against the
// live API from this environment.
function toSdkSecretEnvironmentVariables(
  secretEnvironmentVariables: unknown,
): Record<string, string> | undefined {
  if (!Array.isArray(secretEnvironmentVariables)) return undefined;
  const result: Record<string, string> = {};
  for (const secret of secretEnvironmentVariables as {
    key: string;
    value: string | null;
  }[]) {
    if (secret.value !== null) {
      result[secret.key] = secret.value;
    }
  }
  return result;
}

export async function createContainer(
  this: ContainerSdkContext,
  params: Record<string, unknown>,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.createContainer({
    name: params.name,
    namespaceId: params.namespace_id,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: toSdkSecretEnvironmentVariables(
      params.secret_environment_variables,
    ),
    description: params.description,
    memoryLimitBytes: toSdkMemoryLimitBytes(params.memory_limit),
    mvcpuLimit: params.cpu_limit,
    minScale: params.min_scale,
    maxScale: params.max_scale,
    image: params.registry_image,
    timeout: params.timeout,
    privacy: params.privacy,
    port: params.port,
    httpsConnectionsOnly: toSdkHttpsConnectionsOnly(params.http_option),
    sandbox: params.sandbox,
    startupProbe: toSdkStartupProbe(params.health_check),
    scalingOption: toSdkScalingOption(params.scaling_option),
    privateNetworkId: params.private_network_id,
  });
  return toLegacyContainer(container);
}

export async function updateContainer(
  this: ContainerSdkContext,
  containerId: string,
  params: Record<string, unknown>,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.updateContainer({
    containerId,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: toSdkSecretEnvironmentVariables(
      params.secret_environment_variables,
    ),
    description: params.description,
    memoryLimitBytes: toSdkMemoryLimitBytes(params.memory_limit),
    mvcpuLimit: params.cpu_limit,
    minScale: params.min_scale,
    maxScale: params.max_scale,
    image: params.registry_image,
    timeout: params.timeout,
    privacy: params.privacy,
    port: params.port,
    httpsConnectionsOnly: toSdkHttpsConnectionsOnly(params.http_option),
    sandbox: params.sandbox,
    startupProbe: toSdkStartupProbe(params.health_check),
    scalingOption: toSdkScalingOption(params.scaling_option),
    privateNetworkId: params.private_network_id,
  });
  return toLegacyContainer(container);
}

export async function deployContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.redeployContainer({ containerId });
  return toLegacyContainer(container);
}

export async function deleteContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.deleteContainer({ containerId });
  return toLegacyContainer(container);
}

export async function getContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.getContainer({ containerId });
  return toLegacyContainer(container);
}

export function waitContainersAreDeployed(
  this: WaitContainersAreDeployedContext,
  namespaceId: string,
  attempt = 1,
): Promise<ContainerRecord[]> {
  return this.sdkApi
    .listContainers({ namespaceId })
    .all()
    .then((containers) => {
      let containersAreReady = true;
      for (let i = 0; i < containers.length; i += 1) {
        const container = containers[i];
        if (container.status === "error") {
          throw new Error(container.errorMessage);
        }
        if (container.status !== "ready") {
          containersAreReady = false;
          break;
        }
      }
      if (!containersAreReady) {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for containers in namespace ${namespaceId} to become ready`,
          );
        }
        return new Promise<ContainerRecord[]>((resolve) => {
          setTimeout(
            () =>
              resolve(this.waitContainersAreDeployed(namespaceId, attempt + 1)),
            POLL_INTERVAL_MS,
          );
        });
      }
      return containers.map(toLegacyContainer);
    });
}

export function waitForContainer(
  this: WaitForContainerContext,
  containerId: string,
  attempt = 1,
): Promise<ContainerRecord | undefined> {
  return this.getContainer(containerId)
    .then((container) => {
      if (container.status === "error") {
        throw new Error(container.error_message);
      }

      const isContainerInFinalStatus = CONTAINERS_FINAL_STATUSES.includes(
        container.status,
      );

      if (!isContainerInFinalStatus) {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for container ${containerId} to reach a final status`,
          );
        }
        return new Promise<ContainerRecord | undefined>((resolve) => {
          setTimeout(
            () => resolve(this.waitForContainer(containerId, attempt + 1)),
            POLL_INTERVAL_MS,
          );
        });
      }

      return container;
    })
    .catch((err) => {
      // toleration on 404 only: some operations (e.g. checking status of
      // an item after deletion) will return a 404 once the item is gone.
      if (err instanceof Errors.ScalewayError) {
        if (err.status !== 404) {
          throw new Error(err.message);
        }
        return undefined;
      }
      throw err;
    });
}

export function waitDomainsAreDeployedContainer(
  this: WaitDomainsAreDeployedContainerContext,
  containerId: string,
  attempt = 1,
): Promise<DomainRecord[]> {
  return this.listDomainsContainer(containerId).then((domains) => {
    let domainsAreReady = true;

    for (let i = 0; i < domains.length; i += 1) {
      const domain = domains[i];

      if (domain.status === "error") {
        throw new Error(domain.error_message);
      }

      if (domain.status !== "ready") {
        domainsAreReady = false;
        break;
      }
    }
    if (!domainsAreReady) {
      if (attempt >= MAX_POLL_ATTEMPTS) {
        throw new Error(
          `Timed out waiting for domains on container ${containerId} to become ready`,
        );
      }
      return new Promise<DomainRecord[]>((resolve) => {
        setTimeout(
          () =>
            resolve(
              this.waitDomainsAreDeployedContainer(containerId, attempt + 1),
            ),
          POLL_INTERVAL_MS,
        );
      });
    }
    return domains;
  });
}

export async function listDomainsContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<DomainRecord[]> {
  const response = await this.sdkApi.listDomains({ containerId });
  return response.domains.map(toLegacyDomain);
}
