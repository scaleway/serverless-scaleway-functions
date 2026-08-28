import type { ServerlessLoggerContext } from "./types";

interface SdkDomain {
  id: string;
  hostname: string;
}

interface DomainSdkApi {
  // createDomain's request shape genuinely differs between products - the
  // Function SDK's CreateDomainRequest wants { hostname, functionId }, the
  // Container SDK's wants { hostname, containerId } - no common structural
  // shape to type narrowly the way namespaces.ts/functions.ts do, since
  // these aren't just optional-field supersets of each other, the ID key
  // name itself differs. Record<string, unknown> here is a deliberate,
  // narrow escape hatch for that one real mismatch, not a general pattern.
  createDomain(request: Record<string, unknown>): Promise<SdkDomain>;
  deleteDomain(request: { domainId: string }): Promise<SdkDomain>;
}

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

interface DomainSdkContext {
  sdkApi: DomainSdkApi;
}

interface DomainSelfContext extends DomainSdkContext {
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
export async function createDomain(
  this: DomainSdkContext,
  params: CreateDomainParams,
): Promise<DomainRecord> {
  const domain = await this.sdkApi.createDomain({
    hostname: params.hostname,
    functionId: params.function_id,
    containerId: params.container_id,
  });
  return { ...domain };
}

/**
 * deleteDomains is used to destroy an existing domain by it's ID.
 * @param domainID ID of the selected domain.
 */
export async function deleteDomain(
  this: DomainSdkContext,
  domainID: string,
): Promise<DomainRecord> {
  const domain = await this.sdkApi.deleteDomain({ domainId: domainID });
  return { ...domain };
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
