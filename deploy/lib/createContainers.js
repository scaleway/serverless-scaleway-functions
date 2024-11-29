"use strict";

const BbPromise = require("bluebird");
const singleSource = require("../../shared/singleSource");
const secrets = require("../../shared/secrets");
const domainUtils = require("../../shared/domains");

const maxConcurrencyDeprecationWarning = `WARNING: maxConcurrency is deprecated and has been replaced by scalingOption of type: concurrentRequests.
Please update your serverless.yml file.`;

function adaptHealthCheckToAPI(healthCheck) {
  if (!healthCheck) {
    return null;
  }

  // We need to find the type of the health check (tcp, http, ...)
  // If httpPath is provided, we default to http, otherwise we default to tcp
  let type = healthCheck.httpPath ? "http" : "tcp";
  if (healthCheck.type) {
    type = healthCheck.type;
  }

  return {
    failure_threshold: healthCheck.failureThreshold,
    interval: healthCheck.interval,
    ...(type === "http" && { http: { path: healthCheck.httpPath || "/" } }),
    ...(type === "tcp" && { tcp: {} }),
  };
}

const scalingOptionToAPIProperty = {
  concurrentRequests: "concurrent_requests_threshold",
  cpuUsage: "cpu_usage_threshold",
  memoryUsage: "memory_usage_threshold",
};

function adaptScalingOptionToAPI(scalingOption) {
  if (!scalingOption || !scalingOption.type) {
    return null;
  }

  const property = scalingOptionToAPIProperty[scalingOption.type];
  if (!property) {
    throw new Error(
      `scalingOption.type must be one of: ${Object.keys(
        scalingOptionToAPIProperty
      ).join(", ")}`
    );
  }

  return {
    [property]: scalingOption.threshold,
  };
}

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
    this.listDomainsContainer(containerId).then((domains) => {
      const existingDomains = domainUtils.formatDomainsStructure(domains);
      const domainsToCreate = domainUtils.getDomainsToCreate(
        customDomains,
        existingDomains
      );
      const domainsIdToDelete = domainUtils.getDomainsToDelete(
        customDomains,
        existingDomains
      );

      domainsToCreate.forEach((newDomain) => {
        const createDomainParams = {
          container_id: containerId,
          hostname: newDomain,
        };

        this.createDomainAndLog(createDomainParams);
      });

      domainsIdToDelete.forEach((domainId) => {
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
      Object.keys(containers)
    );

    this.deleteContainersByIds(deleteData.elementsIdsToRemove);

    const promises = deleteData.serviceNamesRet.map((containerName) => {
      const container = Object.assign(containers[containerName], {
        name: containerName,
      });

      const foundContainer = foundContainers.find(
        (c) => c.name === container.name
      );

      return foundContainer
        ? this.updateSingleContainer(container, foundContainer)
        : this.createSingleContainer(container);
    });

    return Promise.all(promises).then((updatedContainers) => {
      this.containers = updatedContainers;
    });
  },

  createSingleContainer(container) {
    const params = {
      name: container.name,
      environment_variables: container.env,
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        container.secret
      ),
      namespace_id: this.namespace.id,
      description: container.description,
      memory_limit: container.memoryLimit,
      cpu_limit: container.cpuLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      registry_image: container.registryImage,
      max_concurrency: container.maxConcurrency,
      timeout: container.timeout,
      privacy: container.privacy,
      port: container.port,
      http_option: container.httpOption,
      sandbox: container.sandbox,
      health_check: adaptHealthCheckToAPI(container.healthCheck),
      scaling_option: adaptScalingOptionToAPI(container.scalingOption),
    };

    // checking if there is custom_domains set on container creation.
    if (container.custom_domains && container.custom_domains.length > 0) {
      this.serverless.cli.log(
        "WARNING: custom_domains are available on container update only. " +
          "Redeploy your container to apply custom domains. Doc : https://www.scaleway.com/en/docs/compute/containers/how-to/add-a-custom-domain-to-a-container/"
      );
    }

    // note about maxConcurrency deprecation
    if (container.maxConcurrency) {
      this.serverless.cli.log(maxConcurrencyDeprecationWarning);
    }

    this.serverless.cli.log(`Creating container ${container.name}...`);

    return this.createContainer(params).then((response) =>
      Object.assign(response, { directory: container.directory })
    );
  },

  async updateSingleContainer(container, foundContainer) {
    const params = {
      redeploy: false,
      environment_variables: container.env,
      secret_environment_variables: await secrets.mergeSecretEnvVars(
        foundContainer.secret_environment_variables,
        secrets.convertObjectToModelSecretsArray(container.secret),
        this.serverless.cli
      ),
      description: container.description,
      memory_limit: container.memoryLimit,
      cpu_limit: container.cpuLimit,
      min_scale: container.minScale,
      max_scale: container.maxScale,
      registry_image: container.registryImage
        ? container.registryImage
        : `${this.namespace.registry_endpoint}/${container.name}:latest`,
      max_concurrency: container.maxConcurrency,
      timeout: container.timeout,
      privacy: container.privacy,
      port: container.port,
      http_option: container.httpOption,
      sandbox: container.sandbox,
      health_check: adaptHealthCheckToAPI(container.healthCheck),
      scaling_option: adaptScalingOptionToAPI(container.scalingOption),
    };

    // note about maxConcurrency deprecation
    if (container.maxConcurrency) {
      this.serverless.cli.log(maxConcurrencyDeprecationWarning);
    }

    this.serverless.cli.log(`Updating container ${container.name}...`);

    // assign domains
    this.applyDomainsContainer(foundContainer.id, container.custom_domains);

    return this.updateContainer(foundContainer.id, params).then((response) =>
      Object.assign(response, { directory: container.directory })
    );
  },
};
