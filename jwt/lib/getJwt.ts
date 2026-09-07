import { PRIVACY_PRIVATE } from "../../shared/constants";

interface Namespace {
  id: string;
  name: string;
  token?: string;
  [key: string]: unknown;
}

interface ApplicationRecord {
  id: string;
  name: string;
  privacy: string;
  token?: string;
  [key: string]: unknown;
}

interface JwtResponse {
  token?: string;
  [key: string]: unknown;
}

interface GetJwtContext {
  serverless: { cli: { log(message: string): void } };
  provider: { getScwProject(): string | undefined };
  namespaceName: string;
  namespace: Namespace;
  tokenExpirationDate: string;
  getNamespaceFromList(
    namespaceName: string,
    projectId: string | undefined,
  ): Promise<Namespace | undefined>;
  // Only one of these two is ever actually mixed in - see the identical
  // comment in logs/lib/getLogs.ts.
  listFunctions?(namespaceId: string): Promise<ApplicationRecord[]>;
  listContainers?(namespaceId: string): Promise<ApplicationRecord[]>;
  issueJwtNamespace(
    namespaceId: string,
    expirationDate: string,
  ): Promise<JwtResponse>;
  issueJwtFunction(
    functionId: string,
    expirationDate: string,
  ): Promise<JwtResponse>;
  issueJwtContainer(
    containerId: string,
    expirationDate: string,
  ): Promise<JwtResponse>;
  setNamespace(namespace: Namespace | undefined): void;
  getJwtNamespace(): Promise<void>;
  getJwtFunctions(functions: ApplicationRecord[]): Promise<unknown[]>;
  getJwtContainers(containers: ApplicationRecord[]): Promise<unknown[]>;
}

export async function getJwt(this: GetJwtContext) {
  if (typeof this.listFunctions === "function") {
    const namespace = await this.getNamespaceFromList(
      this.namespaceName,
      this.provider.getScwProject(),
    );
    this.setNamespace(namespace);
    await this.getJwtNamespace();
    const functions = await this.listFunctions(this.namespace.id);
    return this.getJwtFunctions(functions);
  }
  if (typeof this.listContainers === "function") {
    const namespace = await this.getNamespaceFromList(
      this.namespaceName,
      this.provider.getScwProject(),
    );
    this.setNamespace(namespace);
    await this.getJwtNamespace();
    const containers = await this.listContainers(this.namespace.id);
    return this.getJwtContainers(containers);
  }
  return undefined;
}

export function setNamespace(
  this: GetJwtContext,
  namespace: Namespace | undefined,
): void {
  if (!namespace) {
    throw new Error(
      `Namespace <${this.namespaceName}> doesn't exist, you should deploy it first.`,
    );
  }
  this.namespace = namespace;
}

export function getJwtNamespace(this: GetJwtContext): Promise<void> {
  return this.issueJwtNamespace(this.namespace.id, this.tokenExpirationDate)
    .then((response) =>
      Object.assign(this.namespace, { token: response.token }),
    )
    .then(() =>
      this.serverless.cli.log(
        `Namespace <${this.namespace.name}> token (valid until ${this.tokenExpirationDate}):\n${this.namespace.token}\n`,
      ),
    );
}

export function getJwtFunctions(
  this: GetJwtContext,
  functions: ApplicationRecord[],
): Promise<unknown[]> {
  const promises = functions.map((func) => {
    if (func.privacy === PRIVACY_PRIVATE) {
      return this.issueJwtFunction(func.id, this.tokenExpirationDate)
        .then((response) => Object.assign(func, { token: response.token }))
        .then(() =>
          this.serverless.cli.log(
            `Function <${func.name}> token (valid until ${this.tokenExpirationDate}):\n${func.token}\n`,
          ),
        );
    }
    return undefined;
  });
  return Promise.all(promises);
}

export function getJwtContainers(
  this: GetJwtContext,
  containers: ApplicationRecord[],
): Promise<unknown[]> {
  const promises = containers.map((container) => {
    if (container.privacy === PRIVACY_PRIVATE) {
      return this.issueJwtContainer(container.id, this.tokenExpirationDate)
        .then((response) => Object.assign(container, { token: response.token }))
        .then(() =>
          this.serverless.cli.log(
            `Container <${container.name}> token (valid until ${this.tokenExpirationDate}):\n${container.token}\n`,
          ),
        );
    }
    return undefined;
  });
  return Promise.all(promises);
}
