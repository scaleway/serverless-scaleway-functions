"use strict";

module.exports = {
  deployContainers() {
    this.serverless.cli.log("Deploying Containers...");
    return this.printContainerEndpointsAfterDeployment();
  },

  async printContainerEndpointsAfterDeployment() {
    const containers = await this.waitContainersAreDeployed(this.namespace.id);

    for (const container of containers) {
      this.serverless.cli.log(
        `Container ${container.name} has been deployed to: https://${container.domain_name}`
      );

      this.serverless.cli.log("Waiting for domains deployment...");

      const domains = await this.waitDomainsAreDeployedContainer(container.id);
      domains.forEach((domain) => {
        this.serverless.cli.log(`Domain ready: ${domain.hostname}`);
      });
    }
  },
};
