interface ApplicationRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface LogLine {
  message: string;
  [key: string]: unknown;
}

interface Namespace {
  id: string;
  [key: string]: unknown;
}

interface GetLogsContext {
  serverless: { cli: { log(message: string): void } };
  provider: { getScwProject(): string | undefined };
  options: { function?: string };
  namespaceName: string;
  getNamespaceFromList(
    namespaceName: string,
    projectId: string | undefined,
  ): Promise<Namespace>;
  // Only one of these two is ever actually mixed in - the plugin selects
  // FunctionApi or ContainerApi at construction (shared/api/endpoint.js) -
  // hence the typeof check in listApplications below.
  listFunctions?(namespaceId: string): Promise<ApplicationRecord[]>;
  listContainers?(namespaceId: string): Promise<ApplicationRecord[]>;
  getLines(application: ApplicationRecord): Promise<LogLine[]>;
  listApplications(namespace: Namespace): Promise<ApplicationRecord[]>;
  getApplicationId(apps: ApplicationRecord[]): ApplicationRecord;
  printLines(logs: LogLine[]): void;
}

export async function getLogs(this: GetLogsContext): Promise<void> {
  const namespace = await this.getNamespaceFromList(
    this.namespaceName,
    this.provider.getScwProject(),
  );
  const apps = await this.listApplications(namespace);
  const app = this.getApplicationId(apps);
  const lines = await this.getLines(app);
  return this.printLines(lines);
}

export function listApplications(
  this: GetLogsContext,
  namespace: Namespace,
): Promise<ApplicationRecord[]> {
  if (typeof this.listFunctions === "function") {
    return this.listFunctions(namespace.id);
  }
  return this.listContainers!(namespace.id);
}

export function getApplicationId(
  this: GetLogsContext,
  apps: ApplicationRecord[],
): ApplicationRecord {
  for (let i = 0; i < apps.length; i += 1) {
    if (apps[i].name === this.options.function) {
      return apps[i];
    }
  }
  throw new Error(`application "${this.options.function}" not found`);
}

export function printLines(this: GetLogsContext, logs: LogLine[]): void {
  this.serverless.cli.log(
    '----\n⚠️ WARNING: "serverless logs" command is deprecated and will be removed on March 12, 2024. ' +
      "Please use Cockpit as soon as possible to continue browsing your logs. " +
      "Refer to our documentation here: https://www.scaleway.com/en/developers/api/serverless-containers/#logs.\n----",
  );
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    this.serverless.cli.log(logs[i].message);
  }
}
