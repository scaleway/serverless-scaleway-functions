'use strict';

const BbPromise = require('bluebird');

module.exports = {
  deployContainers() {
    this.serverless.cli.log('Deploying Containers...');
    return BbPromise.bind(this)
      .then(this.deployEachContainer)
      .then(() => this.serverless.cli.log('Waiting for container deployments, this may take multiple minutes...'))
      .then(this.waitContainersAreDeployed)
      .catch((err) => {
        throw new Error(err.response.data.message)
      });
  },

  deployEachContainer() {
    const promises = this.containers.map(
      container => this.provider.apiManager.post(`containers/${container.id}/deploy`, {})
      .then(response => response.data)
      .catch((err) => {
        throw new Error(err.response.data.message)
      }),
    );

    return Promise.all(promises);
  },

  waitContainersAreDeployed() {
    return this.provider.apiManager.get(`namespaces/${this.namespace.id}/containers`)
      .then((response) => {
        const containers = response.data.containers || [];
        let containersAreReady = true;
        for (let i = 0; i < containers.length; i += 1) {
          const container = response.data.containers[i];
          if (container.status === 'error') {
            throw new Error(container.error_message)
          }
          if (container.status !== 'ready') {
            containersAreReady = false;
            break;
          }
        }
        if (!containersAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitContainersAreDeployed()), 5000);
          });
        }

        // Print every containers endpoint
        return containers.forEach(container => this.serverless.cli.log(`Container ${container.name} has been deployed to: ${container.endpoint}`));
      });
  },
};
