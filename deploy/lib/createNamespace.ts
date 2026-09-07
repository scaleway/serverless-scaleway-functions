import * as secrets from "../../shared/secrets";

interface Namespace {
  id: string;
  status: string;
  error_message?: string;
  secret_environment_variables?: { key: string; hashed_value: string }[];
  [key: string]: unknown;
}

interface SecretModel {
  key: string;
  value: string | null;
}

interface CreateNamespaceContext {
  serverless: { cli: { log(message: string): void } };
  provider: { getScwProject(): string | undefined };
  namespaceName: string;
  namespaceVariables?: Record<string, string>;
  namespaceSecretVariables?: Record<string, string>;
  namespace: Namespace;
  getNamespaceFromList(
    namespaceName: string,
    projectId: string | undefined,
  ): Promise<Namespace | undefined>;
  createNamespace(params: Record<string, unknown>): Promise<Namespace>;
  updateNamespace(
    namespaceId: string,
    params: Record<string, unknown>,
  ): Promise<unknown>;
  waitNamespaceIsReady(namespaceId: string): Promise<Namespace>;
  createIfNotExists(foundNamespace: Namespace | undefined): Promise<void>;
  saveNamespaceToProvider(namespace: Namespace): void;
  waitNamespaceIsReadyAndSave(): Promise<void>;
  updateNamespaceConfiguration(): Promise<unknown>;
}

export async function createServerlessNamespace(
  this: CreateNamespaceContext,
): Promise<void> {
  const namespace = await this.getNamespaceFromList(
    this.namespaceName,
    this.provider.getScwProject(),
  );
  return this.createIfNotExists(namespace);
}

export function updateServerlessNamespace(
  this: CreateNamespaceContext,
): Promise<unknown> {
  return this.updateNamespaceConfiguration();
}

export function saveNamespaceToProvider(
  this: CreateNamespaceContext,
  namespace: Namespace,
): void {
  this.namespace = namespace;
}

export function createIfNotExists(
  this: CreateNamespaceContext,
  foundNamespace: Namespace | undefined,
): Promise<void> {
  // If Space already exists -> Do not create
  if (foundNamespace && foundNamespace.status === "error") {
    this.saveNamespaceToProvider(foundNamespace);
    throw new Error(foundNamespace.error_message);
  }

  if (foundNamespace && foundNamespace.status === "ready") {
    this.saveNamespaceToProvider(foundNamespace);
    return Promise.resolve();
  }

  if (foundNamespace && foundNamespace.status !== "ready") {
    this.serverless.cli.log("Waiting for Namespace to become ready...");
    return this.waitNamespaceIsReadyAndSave();
  }

  this.serverless.cli.log("Creating namespace...");
  const params = {
    name: this.namespaceName,
    project_id: this.provider.getScwProject(),
    environment_variables: this.namespaceVariables,
    secret_environment_variables: secrets.convertObjectToModelSecretsArray(
      this.namespaceSecretVariables,
    ),
  };

  return this.createNamespace(params)
    .then((response) => this.saveNamespaceToProvider(response))
    .then(() => this.waitNamespaceIsReadyAndSave());
}

export async function updateNamespaceConfiguration(
  this: CreateNamespaceContext,
): Promise<unknown> {
  if (this.namespaceVariables || this.namespaceSecretVariables) {
    const params: {
      environment_variables?: Record<string, string>;
      secret_environment_variables?: SecretModel[];
    } = {};
    if (this.namespaceVariables) {
      params.environment_variables = this.namespaceVariables;
    }
    if (this.namespaceSecretVariables) {
      params.secret_environment_variables = await secrets.mergeSecretEnvVars(
        this.namespace.secret_environment_variables!,
        secrets.convertObjectToModelSecretsArray(this.namespaceSecretVariables),
        this.serverless.cli,
      );
    }
    return this.updateNamespace(this.namespace.id, params);
  }
  return undefined;
}

export function waitNamespaceIsReadyAndSave(
  this: CreateNamespaceContext,
): Promise<void> {
  return this.waitNamespaceIsReady(this.namespace.id).then((namespace) =>
    this.saveNamespaceToProvider(namespace),
  );
}
