import { Errors } from "@scaleway/sdk-client";
import type { WaitForOptions } from "@scaleway/sdk-client";
import { withRetry } from "../retry";

// Functionv1beta1.API and Containerv1.API each define their own Namespace
// type and namespace CRUD methods (separate products, no shared base class)
// but with matching field/method shapes - this interface captures only what
// this file actually reads/calls, so both product APIs satisfy it
// structurally without a union type or per-product duplication.
//
// The two products' secretEnvironmentVariables shapes have diverged since
// Containers moved to v1 (Functions is still on v1beta1): v1beta1 returns
// {key,hashedValue}[], v1 returns Record<string,string> directly. Both are
// accepted here (see toLegacyNamespace below for the shape-detecting
// translation) rather than splitting this file per product.
interface SdkNamespace {
  id: string;
  name: string;
  status: string;
  errorMessage?: string;
  registryEndpoint?: string;
  secretEnvironmentVariables?:
    { key: string; hashedValue: string }[] | Record<string, string>;
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
  // Set by whichever concrete class (FunctionApi/ContainerApi in
  // shared/api/index.ts) constructs this context, since the two products'
  // real request shapes have diverged the same way Container's own
  // secretEnvironmentVariables did (see containers.ts's
  // toSdkSecretEnvironmentVariables) - Functionv1beta1 still wants
  // {key,value|null}[], Containerv1 wants a plain Record<string,string>.
  secretEnvironmentVariablesShape: "array" | "record";
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

function toLegacySecretEnvironmentVariables(
  secretEnvironmentVariables: SdkNamespace["secretEnvironmentVariables"],
): { key: string; hashed_value: string }[] | undefined {
  if (!secretEnvironmentVariables) return undefined;
  if (Array.isArray(secretEnvironmentVariables)) {
    return secretEnvironmentVariables.map((secret) => ({
      key: secret.key,
      hashed_value: secret.hashedValue,
    }));
  }
  return Object.entries(secretEnvironmentVariables).map(
    ([key, hashed_value]) => ({ key, hashed_value }),
  );
}

function toLegacyNamespace(namespace: SdkNamespace): Namespace {
  return {
    ...namespace,
    error_message: namespace.errorMessage,
    registry_endpoint: namespace.registryEndpoint,
    secret_environment_variables: toLegacySecretEnvironmentVariables(
      namespace.secretEnvironmentVariables,
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

// TEMPORARY WORKAROUND, not a real fix - see the "study" and "cross-study"
// discussion this came out of (2026-08-31): Scaleway's project creation is
// central, but the Functions/Containers APIs are regional, and there's a
// small, genuinely intermittent sync lag between the two - a namespace
// created under a just-created project can 403 ("Not authorized") on the
// very first status check, even though the exact same project/namespace was
// already confirmed reachable moments earlier (confirmed live in CI:
// multi-region and functions suites, 2026-08-31, ScalewayError: http error
// 403 inside this exact call, never reproducible on demand in a standalone
// script - a real race, not a persistent problem). The SDK's own
// waitForNamespace (built on @scaleway/sdk-client's tryAtIntervals) has zero
// tolerance for a thrown error mid-poll - one 403 anywhere in its internal
// polling aborts the whole wait immediately instead of treating it as "not
// ready yet". Retrying the *entire* waitForNamespace call on a 403
// specifically (not on its own eventual timeout, which is a plain Error,
// not a ScalewayError, so isRetryable already excludes it) tolerates that
// race without touching the SDK's internals. Known limitation: if a 403 hit
// deep into a long wait (rather than on the first attempt, which is the
// only shape ever actually observed), this discards that progress and
// restarts the full wait from zero rather than resuming - acceptable here
// only because the fix is meant to be temporary and the observed failure is
// always on the very first check.
// TODO: remove once shared/api/*.ts's other hand-rolled/SDK-backed waiters
// (waitForFunctionStatus, waitForContainer, etc - the same class of gap)
// get a proper per-attempt transient-error tolerance instead of retrying
// the whole operation from scratch.
const NAMESPACE_READY_403_RETRY_MAX_ATTEMPTS = 5;
const NAMESPACE_READY_403_RETRY_INITIAL_DELAY_MS = 500;
const NAMESPACE_READY_403_RETRY_MAX_DELAY_MS = 5000;

export async function waitNamespaceIsReady(
  this: NamespaceSdkContext,
  namespaceId: string,
): Promise<Namespace> {
  const namespace = await withRetry(
    () =>
      this.sdkApi.waitForNamespace(
        { namespaceId },
        { timeout: WAIT_TIMEOUT_SECONDS },
      ),
    {
      maxAttempts: NAMESPACE_READY_403_RETRY_MAX_ATTEMPTS,
      initialDelayMs: NAMESPACE_READY_403_RETRY_INITIAL_DELAY_MS,
      maxDelayMs: NAMESPACE_READY_403_RETRY_MAX_DELAY_MS,
      isRetryable: (err) =>
        err instanceof Errors.ScalewayError && err.status === 403,
    },
  );
  if (namespace.status === "error") {
    throw new Error(namespace.errorMessage);
  }
  return toLegacyNamespace(namespace);
}

// See the identical helper/comment in containers.ts's
// toSdkSecretEnvironmentVariables - same shape translation, same caveat
// about a null-valued (removed) entry having no representation in a plain
// Record<string,string>.
function toSdkSecretEnvironmentVariables(
  secretEnvironmentVariables: unknown,
): Record<string, string> | undefined {
  if (!Array.isArray(secretEnvironmentVariables)) return undefined;
  const result: Record<string, string> = {};
  for (const secret of secretEnvironmentVariables as {
    key: string;
    value: string | null;
  }[]) {
    if (secret.value !== null) {
      result[secret.key] = secret.value;
    }
  }
  return result;
}

function toSdkSecretEnvVarsForShape(
  shape: NamespaceSdkContext["secretEnvironmentVariablesShape"],
  secretEnvironmentVariables: unknown,
): unknown {
  return shape === "record"
    ? toSdkSecretEnvironmentVariables(secretEnvironmentVariables)
    : secretEnvironmentVariables;
}

export async function createNamespace(
  this: NamespaceSdkContext,
  params: Record<string, unknown>,
): Promise<Namespace> {
  const namespace = await this.sdkApi.createNamespace({
    name: params.name,
    projectId: params.project_id,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: toSdkSecretEnvVarsForShape(
      this.secretEnvironmentVariablesShape,
      params.secret_environment_variables,
    ),
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
    secretEnvironmentVariables: toSdkSecretEnvVarsForShape(
      this.secretEnvironmentVariablesShape,
      params.secret_environment_variables,
    ),
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
