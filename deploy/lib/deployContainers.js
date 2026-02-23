"use strict";

module.exports = {
  deployContainers() {
    this.serverless.cli.log("Deploying Containers...");
    return this.printContainerEndpointsAfterDeployment();
  },

  printContainerEndpointsAfterDeployment() {
    return this.waitContainersAreDeployed(this.namespace.id).then(
      (containers) => {
        containers.forEach((container) => {
          this.serverless.cli.log(
            `Container ${container.name} has been deployed to: https://${container.domain_name}`
          );

          this.serverless.cli.log("Waiting for domains deployment...");

          this.waitDomainsAreDeployedContainer(container.id).then((domains) => {
            domains.forEach((domain) => {
              this.serverless.cli.log(`Domain ready : ${domain.hostname}`);
            });
          });
        });
      }
    );
  },
};
