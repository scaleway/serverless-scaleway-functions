'use strict';

const BbPromise = require('bluebird');

module.exports = {
  createContainers() {
    return BbPromise.bind(this)
      .then(() => this.listContainers(this.namespace.id))
      .then(this.createOrUpdateContainers);
  },

  createOrUpdateContainers(foundContainers) {
    const { containers } = this.provider.serverless.service.custom;
    const containerNames = Object.keys(containers);
    const promises = containerNames.map((containerName) => {
      const container = Object.assign(containers[containerName], { name: containerName });
      const foundContainer = foundContainers.find(c => c.name === container.name);
      return foundContainer
        ? this.updateSingleContainer(container, foundContainer)
        : this.createSingleContainer(container);
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
      timeout: container.timeout,
    };

    this.serverless.cli.log(`Creating container ${container.name}...`);

    return this.createContainer(params)
      .then(response => Object.assign(response, { directory: container.directory }));
  },

  updateSingleContainer(container, foundContainer) {
    const params = {
      redeploy: false,
      environment_variables: container.env,
      memory_limit: container.memoryLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      timeout: container.timeout,
    };

    this.serverless.cli.log(`Updating container ${container.name}...`);
    return this.updateContainer(foundContainer.id, params)
      .then(response => Object.assign(response, { directory: container.directory }));
  },
};
