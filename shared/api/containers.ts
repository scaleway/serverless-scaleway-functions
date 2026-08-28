import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface ContainerRecord {
  id: string;
  name: string;
  status: string;
  error_message?: string;
  domain_name?: string;
  description?: string;
  http_option?: string;
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  status: string;
  error_message?: string;
  [key: string]: unknown;
}

interface ContainerApi extends ApiManagerContext {
  listContainers(
    namespaceId: string,
    page?: number,
    accumulated?: ContainerRecord[],
  ): Promise<ContainerRecord[]>;
  getContainer(containerId: string): Promise<ContainerRecord>;
  waitContainersAreDeployed(
    namespaceId: string,
    attempt?: number,
  ): Promise<ContainerRecord[]>;
  waitForContainer(
    containerId: string,
    attempt?: number,
  ): Promise<ContainerRecord | undefined>;
  listDomainsContainer(containerId: string): Promise<DomainRecord[]>;
  waitDomainsAreDeployedContainer(
    containerId: string,
    attempt?: number,
  ): Promise<DomainRecord[]>;
}

const CONTAINERS_FINAL_STATUSES = ["ready", "error", "locked"];

const LIST_PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 120;

export function listContainers(
  this: ContainerApi,
  namespaceId: string,
  page = 1,
  accumulated: ContainerRecord[] = [],
): Promise<ContainerRecord[]> {
  const containersUrl = `namespaces/${namespaceId}/containers?page=${page}&page_size=${LIST_PAGE_SIZE}`;
  return this.apiManager
    .get<{ containers: ContainerRecord[] }>(containersUrl)
    .then((response) => {
      const containers = response.data.containers || [];
      const all = accumulated.concat(containers);

      if (containers.length < LIST_PAGE_SIZE) {
        return all;
      }

      return this.listContainers(namespaceId, page + 1, all);
    })
    .catch(manageError);
}

export function createContainer(
  this: ApiManagerContext,
  params: Record<string, unknown>,
): Promise<ContainerRecord> {
  return this.apiManager
    .post<ContainerRecord>("containers", params)
    .then((response) => response.data)
    .catch(manageError);
}

export function updateContainer(
  this: ApiManagerContext,
  containerId: string,
  params: Record<string, unknown>,
): Promise<ContainerRecord> {
  const updateUrl = `containers/${containerId}`;
  return this.apiManager
    .patch<ContainerRecord>(updateUrl, params)
    .then((response) => response.data)
    .catch(manageError);
}

export function deployContainer(
  this: ApiManagerContext,
  containerId: string,
): Promise<ContainerRecord> {
  return this.apiManager
    .post<ContainerRecord>(`containers/${containerId}/deploy`, {})
    .then((response) => response.data)
    .catch(manageError);
}

/**
 * Deletes the container by containerId
 * @returns container with status deleting
 */
export function deleteContainer(
  this: ApiManagerContext,
  containerId: string,
): Promise<ContainerRecord> {
  return this.apiManager
    .delete<ContainerRecord>(`/containers/${containerId}`)
    .then((response) => response.data)
    .catch(manageError);
}

/**
 * Get container information by containerId
 */
export function getContainer(
  this: ApiManagerContext,
  containerId: string,
): Promise<ContainerRecord> {
  return this.apiManager
    .get<ContainerRecord>(`containers/${containerId}`)
    .then((response) => response.data)
    .catch(manageError);
}

export function waitContainersAreDeployed(
  this: ContainerApi,
  namespaceId: string,
  attempt = 1,
): Promise<ContainerRecord[]> {
  return this.apiManager
    .get<{ containers: ContainerRecord[] }>(
      `namespaces/${namespaceId}/containers`,
    )
    .then((response) => {
      const containers = response.data.containers || [];
      let containersAreReady = true;
      for (let i = 0; i < containers.length; i += 1) {
        const container = response.data.containers[i];
        if (container.status === "error") {
          throw new Error(container.error_message);
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
      return containers;
    })
    .catch(manageError);
}

/**
 * @param containerId id of the container to check
 */
export function waitForContainer(
  this: ContainerApi,
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
      if (err.response === undefined) {
        // if we have a raw Error
        throw err;
      } else if (err.response.status !== 404) {
        // if we have a CustomError, we can check the status
        throw new Error(err);
      }
      return undefined;
    });
}

/**
 * Waiting for all domains to be ready on a container
 */
export function waitDomainsAreDeployedContainer(
  this: ContainerApi,
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
export function listDomainsContainer(
  this: ApiManagerContext,
  containerId: string,
): Promise<DomainRecord[]> {
  const domainsUrl = `domains?container_id=${containerId}`;

  return this.apiManager
    .get<{ domains: DomainRecord[] }>(domainsUrl)
    .then((response) => response.data.domains)
    .catch(manageError);
}
