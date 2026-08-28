import { manageError } from "./utils";
import type { ApiManagerContext, ServerlessLoggerContext } from "./types";

interface DomainRecord {
  id: string;
  hostname: string;
  [key: string]: unknown;
}

interface CreateDomainParams {
  function_id?: string;
  container_id?: string;
  hostname: string;
}

interface DomainSelfContext extends ApiManagerContext {
  createDomain(params: CreateDomainParams): Promise<DomainRecord>;
}

/**
 * createDomain is used to call for domain creation, warning : this
 * function does not wait for the domain
 * to be ready.
 * @param params is an object that contains
 * the "function_id" or "container_id", and the "hostname".
 * @returns Promise with create request result.
 */
export function createDomain(
  this: ApiManagerContext,
  params: CreateDomainParams,
): Promise<DomainRecord> {
  return this.apiManager
    .post<DomainRecord>("domains", params)
    .then((response) => response.data)
    .catch(manageError);
}

/**
 * deleteDomains is used to destroy an existing domain by it's ID.
 * @param domainID ID of the selected domain.
 */
export function deleteDomain(
  this: ApiManagerContext,
  domainID: string,
): Promise<DomainRecord> {
  const updateUrl = `domains/${domainID}`;

  return this.apiManager
    .delete<DomainRecord>(updateUrl)
    .then((response) => response.data)
    .catch(manageError);
}

export function createDomainAndLog(
  this: DomainSelfContext & ServerlessLoggerContext,
  createDomainParams: CreateDomainParams,
): Promise<void> {
  return this.createDomain(createDomainParams)
    .then((res) => {
      this.serverless.cli.log(`Creating domain ${res.hostname}`);
    })
    .then(
      () => {},
      (reason: Error) => {
        this.serverless.cli.log(
          `Error on domain : ${createDomainParams.hostname}, reason : ${reason.message}`,
        );

        if (reason.message.includes("could not validate")) {
          this.serverless.cli.log(
            "Ensure CNAME configuration is ok, it can take some time for a record to propagate",
          );
        }
      },
    );
}
