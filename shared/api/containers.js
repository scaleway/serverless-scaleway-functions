"use strict";

const { manageError } = require("./utils");

const CONTAINERS_FINAL_STATUSES = ["ready", "error", "locked"];

module.exports = {
  listContainers(namespaceId) {
    const containersUrl = `namespaces/${namespaceId}/containers`;
    return this.apiManager
      .get(containersUrl)
      .then((response) => response.data.containers || [])
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

  waitContainersAreDeployed(namespaceId) {
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
          return new Promise((resolve) => {
            setTimeout(
              () => resolve(this.waitContainersAreDeployed(namespaceId)),
              5000
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
  waitForContainer(containerId) {
    return this.getContainer(containerId)
      .then((container) => {
        if (container.status === "error") {
          throw new Error(container.error_message);
        }

        const isContainerInFinalStatus = CONTAINERS_FINAL_STATUSES.includes(
          container.status
        );

        if (!isContainerInFinalStatus) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitForContainer(containerId)), 5000);
          });
        }

        return container;
      })
      .catch((err) => {
        // There's no "deleted" status for container,
        // so if the container is not found we consider it as deleted and return null
        if (err.response.status === 404) {
          return null;
        }

        throw new Error(err);
      });
  },

  /**
   * Waiting for all domains to be ready on a container
   * @param {UUID} containerId
   * @returns
   */
  waitDomainsAreDeployedContainer(containerId) {
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
        return new Promise((resolve) => {
          setTimeout(
            () => resolve(this.waitDomainsAreDeployedContainer(containerId)),
            5000
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
