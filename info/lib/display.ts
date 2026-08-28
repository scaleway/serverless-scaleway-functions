import yaml from "js-yaml";

interface ApplicationRecord {
  name: string;
  [key: string]: unknown;
}

interface Namespace {
  id?: string;
  [key: string]: unknown;
}

interface DisplayInfoContext {
  serverless: {
    configurationInput: {
      service: string;
      custom?: { containers?: Record<string, unknown> };
    };
  };
  provider: { getScwProject(): string | undefined };
  getNamespaceFromList(
    namespaceName: string,
    projectId: string | undefined,
  ): Promise<Namespace | undefined>;
  listContainers(namespaceId: string): Promise<ApplicationRecord[]>;
  listFunctions(namespaceId: string): Promise<ApplicationRecord[]>;
}

export function displayInfo(this: DisplayInfoContext): Promise<void> {
  const configInput = this.serverless.configurationInput;

  return this.getNamespaceFromList(
    configInput.service,
    this.provider.getScwProject(),
  ).then((namespace) => {
    if (
      namespace === undefined ||
      namespace === null ||
      namespace.id === undefined ||
      namespace.id === null
    ) {
      return undefined;
    }

    if (
      configInput.custom &&
      configInput.custom.containers &&
      Object.keys(configInput.custom.containers).length !== 0
    ) {
      return this.listContainers(namespace.id).then((containers) => {
        const output: Record<string, ApplicationRecord> = {};
        containers.forEach((container) => {
          output[container["name"]] = container;
        });
        console.log(yaml.dump({ "Stack Outputs": { containers: output } }));
      });
    }

    return this.listFunctions(namespace.id).then((functions) => {
      const output: Record<string, ApplicationRecord> = {};
      functions.forEach((func) => {
        output[func["name"]] = func;
      });
      console.log(yaml.dump({ "Stack Outputs": { functions: output } }));
    });
  });
}
