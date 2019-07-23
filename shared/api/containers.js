'use strict';

const { manageError } = require('./index');

module.exports = {
  listContainers(namespaceId) {
    const containersUrl = `namespaces/${namespaceId}/containers`;
    return this.apiManager.get(containersUrl)
      .then(response => response.data.containers || [])
      .catch(manageError);
  },

  createContainer(params) {
    return this.apiManager.post('containers', params)
      .then(response => response.data)
      .catch(manageError);
  },

  updateContainer(containerId, params) {
    const updateUrl = `containers/${containerId}`;
    return this.apiManager.patch(updateUrl, params)
      .then(response => response.data)
      .catch(manageError);
  },

  deployContainer(containerId) {
    return this.apiManager.post(`containers/${containerId}/deploy`, {})
      .then(response => response.data)
      .catch(manageError);
  },

  waitContainersAreDeployed(namespaceId) {
    return this.apiManager.get(`namespaces/${namespaceId}/containers`)
      .then((response) => {
        const containers = response.data.containers || [];
        let containersAreReady = true;
        for (let i = 0; i < containers.length; i += 1) {
          const container = response.data.containers[i];
          if (container.status === 'error') {
            throw new Error(container.error_message);
          }
          if (container.status !== 'ready') {
            containersAreReady = false;
            break;
          }
        }
        if (!containersAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitContainersAreDeployed(namespaceId)), 5000);
          });
        }
        return containers;
      });
  },
};
