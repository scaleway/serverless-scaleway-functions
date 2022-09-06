'use strict';

const BbPromise = require('bluebird');
const singleSource = require('../../shared/singleSource');
const secrets = require('../../shared/secrets');

module.exports = {
  createContainers() {
    return BbPromise.bind(this)
      .then(() => this.listContainers(this.namespace.id))
      .then(this.createOrUpdateContainers);
  },

  deleteContainersByIds(containersIdsToDelete) {
    containersIdsToDelete.forEach((containerIdToDelete) => {
      this.deleteContainer(containerIdToDelete).then((res) => {
        this.serverless.cli.log(
          `Container ${res.name} removed from config file, deleting it...`
        );
        this.waitForContainerStatus(containerIdToDelete, "deleted").then(
          this.serverless.cli.log(`Container ${res.name} deleted`)
        );
      });
    });
  },

  createOrUpdateContainers(foundContainers) {
    const { containers } = this.provider.serverless.service.custom;

    const deleteData = singleSource.getElementsToDelete(
      this.serverless.configurationInput.singleSource,
      foundContainers,
      Object.keys(containers),
    );

    this.deleteContainersByIds(deleteData.elementsIdsToRemove);

    const promises = deleteData.serviceNamesRet.map((containerName) => {
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
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        container.secret,
      ),
      namespace_id: this.namespace.id,
      memory_limit: container.memoryLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      max_concurrency: container.maxConcurrency,
      timeout: container.timeout,
      privacy: container.privacy,
      port: container.port,
    };

    this.serverless.cli.log(`Creating container ${container.name}...`);

    return this.createContainer(params)
      .then(response => Object.assign(response, { directory: container.directory }));
  },

  async updateSingleContainer(container, foundContainer) {
    const params = {
      redeploy: false,
      environment_variables: container.env,
      secret_environment_variables: await secrets.mergeSecretEnvVars(
        foundContainer.secret_environment_variables,
        secrets.convertObjectToModelSecretsArray(container.secret),
        this.serverless.cli,
      ),
      memory_limit: container.memoryLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      max_concurrency: container.maxConcurrency,
      timeout: container.timeout,
      privacy: container.privacy,
      port: container.port,
    };

    this.serverless.cli.log(`Updating container ${container.name}...`);
    return this.updateContainer(foundContainer.id, params)
      .then(response => Object.assign(response, { directory: container.directory }));
  },
};
