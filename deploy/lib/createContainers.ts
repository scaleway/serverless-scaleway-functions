// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import singleSource = require("../../shared/singleSource");
import secrets = require("../../shared/secrets");
import domainUtils = require("../../shared/domains");
import ScalewayProvider = require("../../provider/scalewayProvider");
import type { Serverless } from "../../shared/serverlessTypes";

const maxConcurrencyDeprecationWarning = `WARNING: maxConcurrency is deprecated and has been replaced by scalingOption of type: concurrentRequests.
Please update your serverless.yml file.`;

interface HealthCheckConfig {
  httpPath?: string;
  type?: string;
  failureThreshold?: number;
  interval?: string;
}

interface HealthCheckAPI {
  failure_threshold?: number;
  interval?: string;
  http?: { path: string };
  tcp?: Record<string, never>;
}

function adaptHealthCheckToAPI(
  healthCheck: HealthCheckConfig | undefined,
): HealthCheckAPI | null {
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

interface ScalingOptionConfig {
  type?: string;
  threshold?: number;
}

const scalingOptionToAPIProperty: Record<string, string> = {
  concurrentRequests: "concurrent_requests_threshold",
  cpuUsage: "cpu_usage_threshold",
  memoryUsage: "memory_usage_threshold",
};

function adaptScalingOptionToAPI(
  scalingOption: ScalingOptionConfig | undefined,
): Record<string, number | undefined> | null {
  if (!scalingOption || !scalingOption.type) {
    return null;
  }

  const property = scalingOptionToAPIProperty[scalingOption.type];
  if (!property) {
    throw new Error(
      `scalingOption.type must be one of: ${Object.keys(
        scalingOptionToAPIProperty,
      ).join(", ")}`,
    );
  }

  return {
    [property]: scalingOption.threshold,
  };
}

interface ContainerConfig {
  name?: string;
  env?: Record<string, string>;
  secret?: Record<string, string>;
  description?: string;
  memoryLimit?: number;
  cpuLimit?: number;
  minScale?: number;
  maxScale?: number;
  registryImage?: string;
  maxConcurrency?: number;
  timeout?: string;
  privacy?: string;
  port?: number;
  httpOption?: string;
  sandbox?: string;
  healthCheck?: HealthCheckConfig;
  scalingOption?: ScalingOptionConfig;
  privateNetworkId?: string;
  custom_domains?: string[];
  [key: string]: unknown;
}

interface ContainerRecord {
  id: string;
  name: string;
  status?: string;
  private_network_id?: string;
  secret_environment_variables?: { key: string; hashed_value: string }[];
  [key: string]: unknown;
}

interface Namespace {
  id: string;
  registry_endpoint?: string;
  [key: string]: unknown;
}

interface CreateContainersContext {
  serverless: Serverless;
  provider: ScalewayProvider;
  namespace: Namespace;
  containers: ContainerRecord[];
  listContainers(namespaceId: string): Promise<ContainerRecord[]>;
  deleteContainer(containerId: string): Promise<ContainerRecord>;
  waitForContainer(containerId: string): Promise<ContainerRecord | undefined>;
  createContainer(params: Record<string, unknown>): Promise<ContainerRecord>;
  updateContainer(
    containerId: string,
    params: Record<string, unknown>,
  ): Promise<ContainerRecord>;
  deployContainer(containerId: string): Promise<ContainerRecord>;
  listDomainsContainer(
    containerId: string,
  ): Promise<{ id: string; hostname: string }[]>;
  createDomainAndLog(params: Record<string, unknown>): Promise<void>;
  deleteDomain(domainId: string): Promise<{ hostname: string }>;
  createOrUpdateContainers(
    foundContainers: ContainerRecord[],
  ): Promise<[unknown[], void]>;
  deleteContainersByIds(containerIdsToDelete: string[]): Promise<unknown[]>;
  applyDomainsContainer(
    containerId: string,
    customDomains: string[] | undefined,
  ): Promise<unknown[]>;
  createSingleContainer(container: ContainerConfig): Promise<ContainerRecord>;
  updateSingleContainer(
    container: ContainerConfig,
    foundContainer: ContainerRecord,
  ): Promise<ContainerRecord>;
}

const exportedContainers = {
  async createContainers(this: CreateContainersContext) {
    const containers = await this.listContainers(this.namespace.id);
    return this.createOrUpdateContainers(containers);
  },

  deleteContainersByIds(
    this: CreateContainersContext,
    containersIdsToDelete: string[],
  ): Promise<unknown[]> {
    const deletePromises = containersIdsToDelete.map((containerIdToDelete) =>
      this.deleteContainer(containerIdToDelete).then((res) => {
        this.serverless.cli.log(
          `Container ${res.name} removed from config file, deleting it...`,
        );
        return this.waitForContainer(containerIdToDelete).then(() => {
          this.serverless.cli.log(`Container ${res.name} deleted`);
        });
      }),
    );

    return Promise.all(deletePromises);
  },

  applyDomainsContainer(
    this: CreateContainersContext,
    containerId: string,
    customDomains: string[] | undefined,
  ): Promise<unknown[]> {
    return this.listDomainsContainer(containerId).then((domains) => {
      const existingDomains = domainUtils.formatDomainsStructure(domains);
      const domainsToCreate = domainUtils.getDomainsToCreate(
        customDomains,
        existingDomains,
      );
      const domainsIdToDelete = domainUtils.getDomainsToDelete(
        customDomains,
        existingDomains,
      );

      const createPromises = domainsToCreate.map((newDomain) => {
        const createDomainParams = {
          container_id: containerId,
          hostname: newDomain,
        };

        return this.createDomainAndLog(createDomainParams);
      });

      const deletePromises = domainsIdToDelete.map((domainId) =>
        this.deleteDomain(domainId).then((res) => {
          this.serverless.cli.log(`Deleting domain ${res.hostname}`);
        }),
      );

      return Promise.all([...createPromises, ...deletePromises]);
    });
  },

  createOrUpdateContainers(
    this: CreateContainersContext,
    foundContainers: ContainerRecord[],
  ): Promise<[unknown[], void]> {
    const { containers } = this.provider.serverless.service.custom!;

    const deleteData = singleSource.getElementsToDelete(
      this.serverless.configurationInput?.singleSource,
      foundContainers,
      Object.keys(containers!),
    );

    const updatePromises = deleteData.serviceNamesRet.map((containerName) => {
      const container: ContainerConfig = Object.assign(
        containers![containerName],
        {
          name: containerName,
        },
      );

      const foundContainer = foundContainers.find(
        (c) => c.name === container.name,
      );

      if (foundContainer) {
        // If the container is not in a final status, we need to wait
        // for it to be reconciled before updating it, otherwise the update will fail.
        return this.waitForContainer(foundContainer.id).then(() => {
          return this.updateSingleContainer(container, foundContainer);
        });
      }

      return this.createSingleContainer(container);
    });

    return Promise.all([
      this.deleteContainersByIds(deleteData.elementsIdsToRemove),
      Promise.all(updatePromises).then((updatedContainers) => {
        this.containers = updatedContainers;
      }),
    ]);
  },

  createSingleContainer(
    this: CreateContainersContext,
    container: ContainerConfig,
  ): Promise<ContainerRecord> {
    const params: Record<string, unknown> = {
      name: container.name,
      environment_variables: container.env,
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        container.secret,
      ),
      namespace_id: this.namespace.id,
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
      private_network_id: container.privateNetworkId,
    };

    // Checking if there is custom_domains set on container creation.
    if (container.custom_domains && container.custom_domains.length > 0) {
      this.serverless.cli.log(
        "WARNING: custom_domains are available on container update only. " +
          "Redeploy your container to apply custom domains. Doc : https://www.scaleway.com/en/docs/compute/containers/how-to/add-a-custom-domain-to-a-container/",
      );
    }

    // note about maxConcurrency deprecation
    if (container.maxConcurrency) {
      this.serverless.cli.log(maxConcurrencyDeprecationWarning);
    }

    this.serverless.cli.log(`Creating container ${container.name}...`);

    return this.createContainer(params).then((createdContainer) => {
      return this.deployContainer(createdContainer.id);
    });
  },

  async updateSingleContainer(
    this: CreateContainersContext,
    container: ContainerConfig,
    foundContainer: ContainerRecord,
  ): Promise<ContainerRecord> {
    // Assign domains to the container before updating it, as it's not possible to manage domains
    // while the container is updating or pending, and we already wait for the container
    // to be in a final status before updating it.
    // => This order of operation is simpler and does not require performing two separate waits.
    await this.applyDomainsContainer(
      foundContainer.id,
      container.custom_domains,
    );

    let privateNetworkId = container.privateNetworkId;
    const hasToDeletePrivateNetwork =
      foundContainer.private_network_id && !container.privateNetworkId;
    if (hasToDeletePrivateNetwork) {
      privateNetworkId = "";
    }

    const params: Record<string, unknown> = {
      environment_variables: container.env,
      secret_environment_variables: await secrets.mergeSecretEnvVars(
        foundContainer.secret_environment_variables!,
        secrets.convertObjectToModelSecretsArray(container.secret),
        this.serverless.cli,
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
      private_network_id: privateNetworkId,
    };

    // note about maxConcurrency deprecation
    if (container.maxConcurrency) {
      this.serverless.cli.log(maxConcurrencyDeprecationWarning);
    }

    this.serverless.cli.log(`Updating container ${container.name}...`);

    return this.updateContainer(foundContainer.id, params).then(
      (updatedContainer) => {
        // If the container is updating, no need to do anything, a redeploy is already in progress.
        if (
          updatedContainer.status === "pending" ||
          updatedContainer.status === "updating"
        ) {
          return updatedContainer;
        }

        this.serverless.cli.log(
          `Redeploying container ${container.name} to apply changes...`,
        );

        return this.deployContainer(updatedContainer.id);
      },
    );
  },
};

export = exportedContainers;

// Exposed non-enumerably so tests can reach these pure helpers directly via
// require() instead of rewire()'s __get__ - see the identical comment (and
// the reason it's needed) in buildAndPushContainers.ts. Non-enumerable so
// Object.assign(this, ...) in deploy/scalewayDeploy.ts's mixin doesn't pick
// these up as instance methods.
Object.defineProperties(exportedContainers, {
  adaptHealthCheckToAPI: { value: adaptHealthCheckToAPI, enumerable: false },
  adaptScalingOptionToAPI: {
    value: adaptScalingOptionToAPI,
    enumerable: false,
  },
});
