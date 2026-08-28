import { Errors } from "@scaleway/sdk-client";

interface SdkContainer {
  id: string;
  name: string;
  status: string;
  errorMessage?: string;
  domainName: string;
  privateNetworkId?: string;
  httpOption: string;
  registryImage: string;
  secretEnvironmentVariables: { key: string; hashedValue: string }[];
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
  deployContainer(request: { containerId: string }): Promise<SdkContainer>;
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
// functions.ts/namespaces.ts.
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
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  status: string;
  error_message?: string;
  [key: string]: unknown;
}

function toLegacyContainer(container: SdkContainer): ContainerRecord {
  return {
    ...container,
    error_message: container.errorMessage,
    domain_name: container.domainName,
    private_network_id: container.privateNetworkId,
    http_option: container.httpOption,
    registry_image: container.registryImage,
    secret_environment_variables: container.secretEnvironmentVariables?.map(
      (secret) => ({ key: secret.key, hashed_value: secret.hashedValue }),
    ),
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
function toSdkHealthCheck(
  healthCheck: unknown,
): Record<string, unknown> | undefined {
  if (!healthCheck || typeof healthCheck !== "object") return undefined;
  const hc = healthCheck as Record<string, unknown>;
  return {
    failureThreshold: hc.failure_threshold,
    interval: hc.interval,
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

export async function createContainer(
  this: ContainerSdkContext,
  params: Record<string, unknown>,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.createContainer({
    name: params.name,
    namespaceId: params.namespace_id,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: params.secret_environment_variables,
    description: params.description,
    memoryLimit: params.memory_limit,
    cpuLimit: params.cpu_limit,
    minScale: params.min_scale,
    maxScale: params.max_scale,
    registryImage: params.registry_image,
    maxConcurrency: params.max_concurrency,
    timeout: params.timeout,
    privacy: params.privacy,
    port: params.port,
    httpOption: params.http_option,
    sandbox: params.sandbox,
    healthCheck: toSdkHealthCheck(params.health_check),
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
    secretEnvironmentVariables: params.secret_environment_variables,
    description: params.description,
    memoryLimit: params.memory_limit,
    cpuLimit: params.cpu_limit,
    minScale: params.min_scale,
    maxScale: params.max_scale,
    registryImage: params.registry_image,
    maxConcurrency: params.max_concurrency,
    timeout: params.timeout,
    privacy: params.privacy,
    port: params.port,
    httpOption: params.http_option,
    sandbox: params.sandbox,
    healthCheck: toSdkHealthCheck(params.health_check),
    scalingOption: toSdkScalingOption(params.scaling_option),
    privateNetworkId: params.private_network_id,
  });
  return toLegacyContainer(container);
}

export async function deployContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.deployContainer({ containerId });
  return toLegacyContainer(container);
}

/**
 * Deletes the container by containerId
 * @returns container with status deleting
 */
export async function deleteContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<ContainerRecord> {
  const container = await this.sdkApi.deleteContainer({ containerId });
  return toLegacyContainer(container);
}

/**
 * Get container information by containerId
 */
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

/**
 * @param containerId id of the container to check
 */
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

/**
 * Waiting for all domains to be ready on a container
 */
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

/**
 * listDomains is used to read all domains of a wanted container.
 * @param containerId the id of the container to read domains.
 */
export async function listDomainsContainer(
  this: ContainerSdkContext,
  containerId: string,
): Promise<DomainRecord[]> {
  const response = await this.sdkApi.listDomains({ containerId });
  return response.domains.map(toLegacyDomain);
}
