import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface FunctionRecord {
  id: string;
  name: string;
  status: string;
  error_message?: string;
  domain_name?: string;
  description?: string;
  http_option?: string;
  runtime?: string;
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  status: string;
  error_message?: string;
  [key: string]: unknown;
}

interface FunctionApi extends ApiManagerContext {
  listFunctions(
    namespaceId: string,
    page?: number,
    accumulated?: FunctionRecord[],
  ): Promise<FunctionRecord[]>;
  getFunction(functionId: string): Promise<FunctionRecord>;
  waitFunctionsAreDeployed(
    namespaceId: string,
    attempt?: number,
  ): Promise<FunctionRecord[]>;
  waitForFunctionStatus(
    functionId: string,
    wantedStatus: string,
    attempt?: number,
  ): Promise<FunctionRecord | undefined>;
  listDomainsFunction(functionId: string): Promise<DomainRecord[]>;
  waitDomainsAreDeployedFunction(
    functionId: string,
    attempt?: number,
  ): Promise<DomainRecord[]>;
}

const LIST_PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 120;

export function listFunctions(
  this: FunctionApi,
  namespaceId: string,
  page = 1,
  accumulated: FunctionRecord[] = [],
): Promise<FunctionRecord[]> {
  const functionsUrl = `namespaces/${namespaceId}/functions?page=${page}&page_size=${LIST_PAGE_SIZE}`;
  return this.apiManager
    .get<{ functions: FunctionRecord[] }>(functionsUrl)
    .then((response) => {
      const functions = response.data.functions || [];
      const all = accumulated.concat(functions);

      if (functions.length < LIST_PAGE_SIZE) {
        return all;
      }

      return this.listFunctions(namespaceId, page + 1, all);
    })
    .catch(manageError);
}

export function createFunction(
  this: ApiManagerContext,
  params: Record<string, unknown>,
): Promise<FunctionRecord> {
  return this.apiManager
    .post<FunctionRecord>("functions", params)
    .then((response) => response.data)
    .catch(manageError);
}

export function updateFunction(
  this: ApiManagerContext,
  functionId: string,
  params: Record<string, unknown>,
): Promise<FunctionRecord> {
  const updateUrl = `functions/${functionId}`;
  return this.apiManager
    .patch<FunctionRecord>(updateUrl, params)
    .then((response) => response.data)
    .catch(manageError);
}

export function deployFunction(
  this: ApiManagerContext,
  functionId: string,
  params: Record<string, unknown>,
): Promise<FunctionRecord> {
  return this.apiManager
    .post<FunctionRecord>(`functions/${functionId}/deploy`, params)
    .then((response) => response.data)
    .catch(manageError);
}

export function getPresignedUrl(
  this: ApiManagerContext,
  functionId: string,
  archiveSize: number,
): Promise<{ url: string; headers: Record<string, string[]> }> {
  return this.apiManager
    .get(`functions/${functionId}/upload-url?content_length=${archiveSize}`)
    .then((response) => response.data)
    .catch(manageError);
}

/**
 * Deletes the function by functionId
 * @returns function with status deleting.
 */
export function deleteFunction(
  this: ApiManagerContext,
  functionId: string,
): Promise<FunctionRecord> {
  return this.apiManager
    .delete<FunctionRecord>(`functions/${functionId}`)
    .then((response) => response.data)
    .catch(manageError);
}

/**
 * Get function information by functionId
 */
export function getFunction(
  this: ApiManagerContext,
  functionId: string,
): Promise<FunctionRecord> {
  return this.apiManager
    .get<FunctionRecord>(`/functions/${functionId}`)
    .then((response) => response.data)
    .catch(manageError);
}

export function waitFunctionsAreDeployed(
  this: FunctionApi,
  namespaceId: string,
  attempt = 1,
): Promise<FunctionRecord[]> {
  return this.listFunctions(namespaceId).then((functions) => {
    let functionsAreReady = true;
    for (let i = 0; i < functions.length; i += 1) {
      const func = functions[i];
      if (func.status === "error") {
        throw new Error(func.error_message);
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
    return functions;
  });
}

/**
 * @param functionId id of the function to check
 * @param wantedStatus wanted function status before leaving the wait status.
 */
export function waitForFunctionStatus(
  this: FunctionApi,
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
      if (err.response === undefined) {
        // if we have a raw Error
        throw err;
      } else if (err.response.status !== 404) {
        // if we have a CustomError, we can check the status
        throw new Error(err);
      }
      return undefined;
    });
}

/**
 * listDomains is used to read all domains of a wanted function.
 * @param functionId the id of the function to read domains.
 */
export function listDomainsFunction(
  this: ApiManagerContext,
  functionId: string,
): Promise<DomainRecord[]> {
  const domainsUrl = `domains?function_id=${functionId}`;

  return this.apiManager
    .get<{ domains: DomainRecord[] }>(domainsUrl)
    .then((response) => response.data.domains)
    .catch(manageError);
}

/**
 * Waiting for all domains to be ready on a function
 */
export function waitDomainsAreDeployedFunction(
  this: FunctionApi,
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
