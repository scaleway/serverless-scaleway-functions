import type { ServerlessLoggerContext } from "./types";

// This file only ever creates/deletes a domain, never lists or waits on
// one - deliberately narrower than functions.ts/containers.ts's own
// (differently-shaped, also locally-scoped) domain types, which cover
// list/wait and so also carry `status`/`error_message`.
interface SdkDomainMutationResult {
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
  createDomain(
    request: Record<string, unknown>,
  ): Promise<SdkDomainMutationResult>;
  deleteDomain(request: { domainId: string }): Promise<SdkDomainMutationResult>;
}

interface DomainMutationRecord {
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
  createDomain(params: CreateDomainParams): Promise<DomainMutationRecord>;
}

// Does not wait for the domain to become ready - see
// waitDomainsAreDeployedFunction/Container in functions.ts/containers.ts
// for that.
export async function createDomain(
  this: DomainSdkContext,
  params: CreateDomainParams,
): Promise<DomainMutationRecord> {
  const domain = await this.sdkApi.createDomain({
    hostname: params.hostname,
    functionId: params.function_id,
    containerId: params.container_id,
  });
  return { ...domain };
}

export async function deleteDomain(
  this: DomainSdkContext,
  domainID: string,
): Promise<DomainMutationRecord> {
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
