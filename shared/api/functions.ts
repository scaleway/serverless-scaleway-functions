import { Errors } from "@scaleway/sdk-client";

interface SdkFunction {
  id: string;
  name: string;
  status: string;
  errorMessage?: string;
  domainName: string;
  runtimeMessage: string;
  privateNetworkId?: string;
  httpOption: string;
  secretEnvironmentVariables: { key: string; hashedValue: string }[];
}

interface SdkDomain {
  id: string;
  hostname: string;
  status: string;
  errorMessage?: string;
}

interface FunctionSdkApi {
  listFunctions(request?: { namespaceId?: string }): Promise<{
    functions: SdkFunction[];
  }> & {
    all(): Promise<SdkFunction[]>;
  };
  createFunction(request: Record<string, unknown>): Promise<SdkFunction>;
  updateFunction(request: Record<string, unknown>): Promise<SdkFunction>;
  deployFunction(request: { functionId: string }): Promise<SdkFunction>;
  getFunctionUploadURL(request: {
    functionId: string;
    contentLength: number;
  }): Promise<{ url: string; headers: Record<string, string[]> }>;
  deleteFunction(request: { functionId: string }): Promise<SdkFunction>;
  getFunction(request: { functionId: string }): Promise<SdkFunction>;
  listDomains(request: {
    functionId: string;
  }): Promise<{ domains: SdkDomain[] }>;
}

interface FunctionSdkContext {
  sdkApi: FunctionSdkApi;
}

interface WaitFunctionsAreDeployedContext extends FunctionSdkContext {
  waitFunctionsAreDeployed(
    namespaceId: string,
    attempt?: number,
  ): Promise<FunctionRecord[]>;
}

interface WaitForFunctionStatusContext extends FunctionSdkContext {
  getFunction(functionId: string): Promise<FunctionRecord>;
  waitForFunctionStatus(
    functionId: string,
    wantedStatus: string,
    attempt?: number,
  ): Promise<FunctionRecord | undefined>;
}

interface WaitDomainsAreDeployedFunctionContext extends FunctionSdkContext {
  listDomainsFunction(functionId: string): Promise<DomainRecord[]>;
  waitDomainsAreDeployedFunction(
    functionId: string,
    attempt?: number,
  ): Promise<DomainRecord[]>;
}

// External shape this file has always returned (snake_case fields several
// production consumers read directly: deploy/lib/deployFunctions.ts's
// domain_name/runtime_message, deploy/lib/createFunctions.ts's
// private_network_id/secret_environment_variables,
// invoke/scalewayInvoke.ts's domain_name) - preserved via aliasing rather
// than changing every consumer, since this is otherwise a pure internal-
// implementation swap.
interface FunctionRecord {
  id: string;
  name: string;
  status: string;
  error_message?: string;
  domain_name?: string;
  runtime_message?: string;
  private_network_id?: string;
  http_option?: string;
  secret_environment_variables?: { key: string; hashed_value: string }[];
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  status: string;
  error_message?: string;
  [key: string]: unknown;
}

function toLegacyFunction(func: SdkFunction): FunctionRecord {
  return {
    ...func,
    error_message: func.errorMessage,
    domain_name: func.domainName,
    runtime_message: func.runtimeMessage,
    private_network_id: func.privateNetworkId,
    http_option: func.httpOption,
    secret_environment_variables: func.secretEnvironmentVariables?.map(
      (secret) => ({ key: secret.key, hashed_value: secret.hashedValue }),
    ),
  };
}

function toLegacyDomain(domain: SdkDomain): DomainRecord {
  return { ...domain, error_message: domain.errorMessage };
}

const POLL_INTERVAL_MS = 5000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 120;

export async function listFunctions(
  this: FunctionSdkContext,
  namespaceId: string,
): Promise<FunctionRecord[]> {
  const functions = await this.sdkApi.listFunctions({ namespaceId }).all();
  return functions.map(toLegacyFunction);
}

export async function createFunction(
  this: FunctionSdkContext,
  params: Record<string, unknown>,
): Promise<FunctionRecord> {
  const func = await this.sdkApi.createFunction({
    name: params.name,
    namespaceId: params.namespace_id,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: params.secret_environment_variables,
    description: params.description,
    memoryLimit: params.memory_limit,
    minScale: params.min_scale,
    maxScale: params.max_scale,
    timeout: params.timeout,
    handler: params.handler,
    privacy: params.privacy,
    httpOption: params.http_option,
    sandbox: params.sandbox,
    privateNetworkId: params.private_network_id,
    runtime: params.runtime,
  });
  return toLegacyFunction(func);
}

export async function updateFunction(
  this: FunctionSdkContext,
  functionId: string,
  params: Record<string, unknown>,
): Promise<FunctionRecord> {
  const func = await this.sdkApi.updateFunction({
    functionId,
    redeploy: params.redeploy,
    environmentVariables: params.environment_variables,
    secretEnvironmentVariables: params.secret_environment_variables,
    description: params.description,
    memoryLimit: params.memory_limit,
    minScale: params.min_scale,
    maxScale: params.max_scale,
    timeout: params.timeout,
    handler: params.handler,
    privacy: params.privacy,
    httpOption: params.http_option,
    sandbox: params.sandbox,
    privateNetworkId: params.private_network_id,
    runtime: params.runtime,
  });
  return toLegacyFunction(func);
}

export async function deployFunction(
  this: FunctionSdkContext,
  functionId: string,
): Promise<FunctionRecord> {
  const func = await this.sdkApi.deployFunction({ functionId });
  return toLegacyFunction(func);
}

export async function getPresignedUrl(
  this: FunctionSdkContext,
  functionId: string,
  archiveSize: number,
): Promise<{ url: string; headers: Record<string, string[]> }> {
  return this.sdkApi.getFunctionUploadURL({
    functionId,
    contentLength: archiveSize,
  });
}

export async function deleteFunction(
  this: FunctionSdkContext,
  functionId: string,
): Promise<FunctionRecord> {
  const func = await this.sdkApi.deleteFunction({ functionId });
  return toLegacyFunction(func);
}

export async function getFunction(
  this: FunctionSdkContext,
  functionId: string,
): Promise<FunctionRecord> {
  const func = await this.sdkApi.getFunction({ functionId });
  return toLegacyFunction(func);
}

export function waitFunctionsAreDeployed(
  this: WaitFunctionsAreDeployedContext,
  namespaceId: string,
  attempt = 1,
): Promise<FunctionRecord[]> {
  return this.sdkApi
    .listFunctions({ namespaceId })
    .all()
    .then((functions) => {
      let functionsAreReady = true;
      for (let i = 0; i < functions.length; i += 1) {
        const func = functions[i];
        if (func.status === "error") {
          throw new Error(func.errorMessage);
        }
        if (func.status !== "ready") {
          functionsAreReady = false;
          break;
        }
      }
      if (!functionsAreReady) {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for functions in namespace ${namespaceId} to become ready`,
          );
        }
        return new Promise<FunctionRecord[]>((resolve) => {
          setTimeout(
            () =>
              resolve(this.waitFunctionsAreDeployed(namespaceId, attempt + 1)),
            POLL_INTERVAL_MS,
          );
        });
      }
      return functions.map(toLegacyFunction);
    });
}

export function waitForFunctionStatus(
  this: WaitForFunctionStatusContext,
  functionId: string,
  wantedStatus: string,
  attempt = 1,
): Promise<FunctionRecord | undefined> {
  return this.getFunction(functionId)
    .then((func) => {
      if (func.status === "error") {
        throw new Error(func.name + ": " + func.error_message);
      }

      if (func.status !== wantedStatus) {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for function ${functionId} to reach status "${wantedStatus}"`,
          );
        }
        return new Promise<FunctionRecord | undefined>((resolve) => {
          setTimeout(
            () =>
              resolve(
                this.waitForFunctionStatus(
                  functionId,
                  wantedStatus,
                  attempt + 1,
                ),
              ),
            POLL_INTERVAL_MS,
          );
        });
      }

      return func;
    })
    .catch((err) => {
      // toleration on 404 only: some operations (e.g. checking status of
      // an item after deletion) will return a 404 once the item is gone.
      if (err instanceof Errors.ScalewayError) {
        if (err.status !== 404) {
          throw new Error(err.message);
        }
        return undefined;
      }
      throw err;
    });
}

export async function listDomainsFunction(
  this: FunctionSdkContext,
  functionId: string,
): Promise<DomainRecord[]> {
  const response = await this.sdkApi.listDomains({ functionId });
  return response.domains.map(toLegacyDomain);
}

export function waitDomainsAreDeployedFunction(
  this: WaitDomainsAreDeployedFunctionContext,
  functionId: string,
  attempt = 1,
): Promise<DomainRecord[]> {
  return this.listDomainsFunction(functionId).then((domains) => {
    let domainsAreReady = true;

    for (let i = 0; i < domains.length; i += 1) {
      const domain = domains[i];

      if (domain.status === "error") {
        throw new Error(domain.error_message);
      }

      if (domain.status !== "ready") {
        domainsAreReady = false;
        break;
      }
    }
    if (!domainsAreReady) {
      if (attempt >= MAX_POLL_ATTEMPTS) {
        throw new Error(
          `Timed out waiting for domains on function ${functionId} to become ready`,
        );
      }
      return new Promise<DomainRecord[]>((resolve) => {
        setTimeout(
          () =>
            resolve(
              this.waitDomainsAreDeployedFunction(functionId, attempt + 1),
            ),
          POLL_INTERVAL_MS,
        );
      });
    }
    return domains;
  });
}
