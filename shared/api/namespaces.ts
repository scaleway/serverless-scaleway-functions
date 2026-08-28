import { Errors } from "@scaleway/sdk-client";
import type { WaitForOptions } from "@scaleway/sdk-client";

// Functionv1beta1.API and Containerv1beta1.API each define their own
// Namespace type and namespace CRUD methods (separate products, no shared
// base class) but with matching field/method shapes - this interface
// captures only what this file actually reads/calls, so both product APIs
// satisfy it structurally without a union type or per-product duplication.
interface SdkNamespace {
  id: string;
  name: string;
  status: string;
  errorMessage?: string;
  registryEndpoint?: string;
  secretEnvironmentVariables?: { key: string; hashedValue: string }[];
}

interface SdkListNamespacesResponse {
  namespaces: SdkNamespace[];
}

interface NamespaceSdkApi {
  listNamespaces(request?: {
    name?: string;
    projectId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<SdkListNamespacesResponse> & { all(): Promise<SdkNamespace[]> };
  getNamespace(request: { namespaceId: string }): Promise<SdkNamespace>;
  waitForNamespace(
    request: { namespaceId: string },
    options?: WaitForOptions<SdkNamespace>,
  ): Promise<SdkNamespace>;
  createNamespace(request: Record<string, unknown>): Promise<SdkNamespace>;
  updateNamespace(request: Record<string, unknown>): Promise<SdkNamespace>;
  deleteNamespace(request: { namespaceId: string }): Promise<SdkNamespace>;
}

interface NamespaceSdkContext {
  sdkApi: NamespaceSdkApi;
}

interface WaitNamespaceIsDeletedContext extends NamespaceSdkContext {
  waitNamespaceIsDeleted(
    namespaceId: string,
    attempt?: number,
  ): Promise<boolean>;
}

// External shape this file has always returned (snake_case fields several
// production consumers read directly: deploy/lib/createNamespace.ts's
// secret_environment_variables, deploy/lib/buildAndPushContainers.ts's
// registry_endpoint) - preserved via aliasing rather than changing every
// consumer, since this is otherwise a pure internal-implementation swap.
interface Namespace {
  id: string;
  name: string;
  status: string;
  error_message?: string;
  registry_endpoint?: string;
  secret_environment_variables?: { key: string; hashed_value: string }[];
  [key: string]: unknown;
}

function toLegacyNamespace(namespace: SdkNamespace): Namespace {
  return {
    ...namespace,
    error_message: namespace.errorMessage,
    registry_endpoint: namespace.registryEndpoint,
    secret_environment_variables: namespace.secretEnvironmentVariables?.map(
      (secret) => ({ key: secret.key, hashed_value: secret.hashedValue }),
    ),
  };
}

// ~10 minutes, matching this file's previous hand-rolled polling budget
// (POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS below).
const WAIT_TIMEOUT_SECONDS = 600;
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 600;

export async function listNamespaces(
  this: NamespaceSdkContext,
  projectId: string | undefined,
): Promise<Namespace[]> {
  const namespaces = await this.sdkApi.listNamespaces({ projectId }).all();
  return namespaces.map(toLegacyNamespace);
}

export async function getNamespaceFromList(
  this: NamespaceSdkContext,
  namespaceName: string,
  projectId: string | undefined,
): Promise<Namespace | undefined> {
  const response = await this.sdkApi.listNamespaces({
    name: namespaceName,
    projectId,
  });
  const namespace = response.namespaces[0];
  // No namespace with this name yet is a real, expected outcome (e.g. the
  // very first deploy of a new service) - every caller already declares
  // its own return type as `Namespace | undefined` and branches on it
  // (deploy/lib/createNamespace.ts's createIfNotExists, in particular).
  return namespace ? toLegacyNamespace(namespace) : undefined;
}

export async function getNamespace(
  this: NamespaceSdkContext,
  namespaceId: string,
): Promise<Namespace> {
  const namespace = await this.sdkApi.getNamespace({ namespaceId });
  return toLegacyNamespace(namespace);
}

export async function waitNamespaceIsReady(
  this: NamespaceSdkContext,
  namespaceId: string,
): Promise<Namespace> {
  const namespace = await this.sdkApi.waitForNamespace(
    { namespaceId },
    { timeout: WAIT_TIMEOUT_SECONDS },
  );
  if (namespace.status === "error") {
    throw new Error(namespace.errorMessage);
  }
  return toLegacyNamespace(namespace);
}

export async function createNamespace(
  this: NamespaceSdkContext,
  params: Record<string, unknown>,
): Promise<Namespace> {
  const namespace = await this.sdkApi.createNamespace({
    name: params.name,
    projectId: params.project_id,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: params.secret_environment_variables,
  });
  return toLegacyNamespace(namespace);
}

export async function updateNamespace(
  this: NamespaceSdkContext,
  namespaceId: string,
  params: Record<string, unknown>,
): Promise<Namespace> {
  const namespace = await this.sdkApi.updateNamespace({
    namespaceId,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: params.secret_environment_variables,
  });
  return toLegacyNamespace(namespace);
}

export async function deleteNamespace(
  this: NamespaceSdkContext,
  namespaceId: string,
): Promise<Namespace> {
  const namespace = await this.sdkApi.deleteNamespace({ namespaceId });
  return toLegacyNamespace(namespace);
}

export function waitNamespaceIsDeleted(
  this: WaitNamespaceIsDeletedContext,
  namespaceId: string,
  attempt = 1,
): Promise<boolean> {
  return this.sdkApi
    .getNamespace({ namespaceId })
    .then((namespace) => {
      if (namespace.status === "deleting") {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for namespace ${namespaceId} to be deleted`,
          );
        }
        return new Promise<boolean>((resolve) => {
          setTimeout(
            () =>
              resolve(this.waitNamespaceIsDeleted(namespaceId, attempt + 1)),
            POLL_INTERVAL_MS,
          );
        });
      }
      return true;
    })
    .catch((err) => {
      // Check the status code via the SDK's own ScalewayError base class,
      // not a specific subclass like ResourceNotFoundError - that subclass
      // is only constructed when the response body's own `type` field is
      // exactly "not_found" (see @scaleway/sdk-client's error-parser.js),
      // which this specific 404 response empirically doesn't set (verified
      // against the real API 2026-08-26). status is present on every
      // ScalewayError regardless of which subclass got parsed, matching
      // this file's previous status-code-only check (err.response.status).
      if (err instanceof Errors.ScalewayError && err.status === 404) {
        return true;
      }
      throw new Error(
        `An error occured during namespace deletion: ${err.message}`,
      );
    });
}
