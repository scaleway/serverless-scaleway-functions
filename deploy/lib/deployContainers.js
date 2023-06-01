"use strict";

const BbPromise = require("bluebird");

module.exports = {
  deployContainers() {
    this.serverless.cli.log("Deploying Containers...");
    return BbPromise.bind(this)
      .then(this.deployEachContainer)
      .then(() =>
        this.serverless.cli.log(
          "Waiting for container deployments, this may take multiple minutes..."
        )
      )
      .then(this.printContainerEndpointsAfterDeployment);
  },

  deployEachContainer() {
    const promises = this.containers.map((container) =>
      this.deployContainer(container.id)
    );
    return Promise.all(promises);
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
