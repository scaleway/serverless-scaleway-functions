"use strict";

const { manageError } = require("./utils");

const CONTAINERS_FINAL_STATUSES = ["ready", "error", "locked"];

const LIST_PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 120;

module.exports = {
  listContainers(namespaceId, page = 1, accumulated = []) {
    const containersUrl = `namespaces/${namespaceId}/containers?page=${page}&page_size=${LIST_PAGE_SIZE}`;
    return this.apiManager
      .get(containersUrl)
      .then((response) => {
        const containers = response.data.containers || [];
        const all = accumulated.concat(containers);

        if (containers.length < LIST_PAGE_SIZE) {
          return all;
        }

        return this.listContainers(namespaceId, page + 1, all);
      })
      .catch(manageError);
  },

  createContainer(params) {
    return this.apiManager
      .post("containers", params)
      .then((response) => response.data)
      .catch(manageError);
  },

  updateContainer(containerId, params) {
    const updateUrl = `containers/${containerId}`;
    return this.apiManager
      .patch(updateUrl, params)
      .then((response) => response.data)
      .catch(manageError);
  },

  deployContainer(containerId) {
    return this.apiManager
      .post(`containers/${containerId}/deploy`, {})
      .then((response) => response.data)
      .catch(manageError);
  },

  /**
   * Deletes the container by containerId
   * @param {UUID} containerId
   * @returns container with status deleting
   */
  deleteContainer(containerId) {
    return this.apiManager
      .delete(`/containers/${containerId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  /**
   * Get container information by containerId
   * @param {UUID} containerId
   * @returns container.
   */
  getContainer(containerId) {
    return this.apiManager
      .get(`containers/${containerId}`)
      .then((response) => response.data)
      .catch(manageError);
  },

  waitContainersAreDeployed(namespaceId, attempt = 1) {
    return this.apiManager
      .get(`namespaces/${namespaceId}/containers`)
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
              `Timed out waiting for containers in namespace ${namespaceId} to become ready`
            );
          }
          return new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(
                  this.waitContainersAreDeployed(namespaceId, attempt + 1)
                ),
              POLL_INTERVAL_MS
            );
          });
        }
        return containers;
      })
      .catch(manageError);
  },

  /**
   *
   * @param {UUID} containerId id of the container to check
   * @returns
   */
  waitForContainer(containerId, attempt = 1) {
    return this.getContainer(containerId)
      .then((container) => {
        if (container.status === "error") {
          throw new Error(container.error_message);
        }

        const isContainerInFinalStatus = CONTAINERS_FINAL_STATUSES.includes(
          container.status
        );

        if (!isContainerInFinalStatus) {
          if (attempt >= MAX_POLL_ATTEMPTS) {
            throw new Error(
              `Timed out waiting for container ${containerId} to reach a final status`
            );
          }
          return new Promise((resolve) => {
            setTimeout(
              () => resolve(this.waitForContainer(containerId, attempt + 1)),
              POLL_INTERVAL_MS
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
      });
  },

  /**
   * Waiting for all domains to be ready on a container
   * @param {UUID} containerId
   * @returns
   */
  waitDomainsAreDeployedContainer(containerId, attempt = 1) {
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
            `Timed out waiting for domains on container ${containerId} to become ready`
          );
        }
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                this.waitDomainsAreDeployedContainer(containerId, attempt + 1)
              ),
            POLL_INTERVAL_MS
          );
        });
      }
      return domains;
    });
  },

  /**
   * listDomains is used to read all domains of a wanted container.
   * @param {Number} containerId the id of the container to read domains.
   * @returns a Promise with request result.
   */
  listDomainsContainer(containerId) {
    const domainsUrl = `domains?container_id=${containerId}`;

    return this.apiManager
      .get(domainsUrl)
      .then((response) => response.data.domains)
      .catch(manageError);
  },
};
