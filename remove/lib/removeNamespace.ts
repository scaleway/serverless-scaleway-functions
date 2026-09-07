interface Namespace {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

interface RemoveNamespaceContext {
  serverless: { cli: { log(message: string): void } };
  provider: { getScwProject(): string | undefined };
  namespaceName: string;
  getNamespaceFromList(
    namespaceName: string,
    projectId: string | undefined,
  ): Promise<Namespace | undefined>;
  deleteNamespace(namespaceId: string): Promise<unknown>;
  waitNamespaceIsDeleted(namespaceId: string): Promise<boolean>;
  removeSingleNamespace(namespace: Namespace | undefined): Promise<void>;
}

export async function removeNamespace(
  this: RemoveNamespaceContext,
): Promise<void> {
  this.serverless.cli.log(
    "Removing namespace and associated functions/triggers...",
  );
  const namespace = await this.getNamespaceFromList(
    this.namespaceName,
    this.provider.getScwProject(),
  );
  return this.removeSingleNamespace(namespace);
}

export function removeSingleNamespace(
  this: RemoveNamespaceContext,
  namespace: Namespace | undefined,
): Promise<void> {
  if (!namespace)
    throw new Error(
      `Unable to remove namespace and functions: No namespace found with name ${this.namespaceName}`,
    );
  return this.deleteNamespace(namespace.id)
    .then(() => this.waitNamespaceIsDeleted(namespace.id))
    .then(() =>
      this.serverless.cli.log("Namespace has been deleted successfully"),
    );
}
