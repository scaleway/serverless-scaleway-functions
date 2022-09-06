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

  applyDomainsContainer(containerId, customDomains) {
    // we make a diff to know which domains to add or delete
    const domainsToCreate = [];
    const domainsIdToDelete = [];
    const existingDomains = [];

    this.listDomainsContainer(containerId).then((domains) => {
      domains.forEach((domain) => {
        existingDomains.push({ hostname: domain.hostname, id: domain.id });
      });

      if (
        customDomains !== undefined &&
        customDomains !== null &&
        customDomains.length > 0
      ) {
        customDomains.forEach((customDomain) => {
          domainsIdToDelete.push(customDomain.id);

          let domainFound = false;

          existingDomains.forEach((existingDom) => {
            if (existingDom.hostname === customDomain) {
              domainFound = true;
              return false;
            }
          });
          if (!domainFound) {
            domainsToCreate.push(customDomain);
          }
        });
      }

      existingDomains.forEach((existingDomain) => {
        if (
          (customDomains === undefined || customDomains === null) &&
          existingDomain.id !== undefined
        ) {
          domainsIdToDelete.push(existingDomain.id);
        } else if (!customDomains.includes(existingDomain.hostname)) {
          domainsIdToDelete.push(existingDomain.id);
        }
      });

      domainsToCreate.forEach((newDomain) => {
        const createDomainParams = { container_id: containerId, hostname: newDomain };

        this.createDomain(createDomainParams)
          .then((res) => {
            this.serverless.cli.log(`Creating domain ${res.hostname}`);
          })
          .then(
            () => {},
            (reason) => {
              this.serverless.cli.log(
                `Error on domain : ${newDomain}, reason : ${reason.message}`
              );

              if (reason.message.includes("could not validate")) {
                this.serverless.cli.log(
                  "Ensure CNAME configuration is ok, it can take some time for a record to propagate"
                );
              }
            }
          );
      });

      domainsIdToDelete.forEach((domainId) => {
        if (domainId === undefined) {
          return;
        }
        this.deleteDomain(domainId).then((res) => {
          this.serverless.cli.log(`Deleting domain ${res.hostname}`);
        });
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
      timeout: container.timeout,
      privacy: container.privacy,
      port: container.port,
    };

    // checking if there is custom_domains set on container creation.
    if (container.custom_domains && container.custom_domains.length > 0) {
      this.serverless.cli.log("WARNING: custom_domains are available on container update only. "+
        "Redeploy your container to apply custom domains. Doc : https://www.scaleway.com/en/docs/compute/containers/how-to/add-a-custom-domain-to-a-container/")
    }

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
      timeout: container.timeout,
      privacy: container.privacy,
      port: container.port,
    };

    this.serverless.cli.log(`Updating container ${container.name}...`);

    // assign domains
    this.applyDomainsContainer(foundContainer.id, container.custom_domains);

    return this.updateContainer(foundContainer.id, params)
      .then(response => Object.assign(response, { directory: container.directory }));
  },
};
