interface ContainerRecord {
  id: string;
  name: string;
  domain_name?: string;
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  [key: string]: unknown;
}

interface DeployContainersContext {
  serverless: { cli: { log(message: string): void } };
  namespace: { id: string };
  waitContainersAreDeployed(namespaceId: string): Promise<ContainerRecord[]>;
  waitDomainsAreDeployedContainer(containerId: string): Promise<DomainRecord[]>;
  printContainerEndpointsAfterDeployment(): Promise<unknown[]>;
}

export function deployContainers(
  this: DeployContainersContext,
): Promise<unknown[]> {
  this.serverless.cli.log("Deploying Containers...");
  return this.printContainerEndpointsAfterDeployment();
}

export function printContainerEndpointsAfterDeployment(
  this: DeployContainersContext,
): Promise<unknown[]> {
  return this.waitContainersAreDeployed(this.namespace.id).then((containers) =>
    Promise.all(
      containers.map((container) => {
        this.serverless.cli.log(
          `Container ${container.name} has been deployed to: https://${container.domain_name}`,
        );

        this.serverless.cli.log("Waiting for domains deployment...");

        return this.waitDomainsAreDeployedContainer(container.id).then(
          (domains) => {
            domains.forEach((domain) => {
              this.serverless.cli.log(`Domain ready: ${domain.hostname}`);
            });
          },
        );
      }),
    ),
  );
}
