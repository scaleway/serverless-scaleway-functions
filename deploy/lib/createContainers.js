'use strict';

const BbPromise = require('bluebird');
const constants = require('./constants');

module.exports = {
  createContainers() {
    return BbPromise.bind(this)
      .then(this.getContainers)
      .then(this.createOrUpdateContainers);
  },

  getContainers() {
    const containersUrl = `namespaces/${this.namespace.id}/containers`;
    return this.provider.apiManager.get(containersUrl)
      .then(response => response.data.containers)
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
  },

  createOrUpdateContainers(foundContainers) {
    const containers = this.provider.serverless.service.custom.containers;
    const containerNames = Object.keys(containers);
    const promises = containerNames.map((containerName) => {
      const container = Object.assign(containers[containerName], { name: containerName });
      const foundContainer = foundContainers.find(c => c.name === container.name);
      return foundContainer ? this.updateContainer(container, foundContainer) : this.createSingleContainer(container);
    });

    return Promise.all(promises)
      .then((updatedContainers) => {
        this.containers = updatedContainers;
      });
  },

  createSingleContainer(container) {
    const params = {
      name: container.name,
      environment_variables: container.env,
      namespace_id: this.namespace.id,
      memory_limit: container.memoryLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      timeout: container.timeout
    };

    this.serverless.cli.log(`Creating container ${container.name}...`);

    return this.provider.apiManager.post('containers', params)
      .then(response => Object.assign(response.data, { directory: container.directory }))
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
  },

  updateContainer(container, foundContainer) {
    const params = {
      redeploy: false,
      environment_variables: container.env,
      memory_limit: container.memoryLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      timeout: container.timeout
    }

    const updateUrl = `containers/${foundContainer.id}`;
    this.serverless.cli.log(`Updating container ${container.name}...`);
    return this.provider.apiManager.patch(updateUrl, params)
      .then(response => Object.assign(response.data, { directory: container.directory }))
      .catch((err) => {
        throw new Error(err.response.data.message)
      })
  },
};
