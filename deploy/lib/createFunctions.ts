import * as secrets from "../../shared/secrets";
import * as singleSource from "../../shared/singleSource";
import * as domainUtils from "../../shared/domains";
import {
  RUNTIME_STATUS_AVAILABLE,
  RUNTIME_STATUS_EOL,
  RUNTIME_STATUS_EOS,
} from "../../shared/runtimes";
import ScalewayProvider from "../../provider/scalewayProvider";
import type { Serverless } from "../../shared/serverlessTypes";

interface FunctionConfig {
  name?: string;
  handler: string;
  runtime?: string;
  env?: Record<string, string>;
  secret?: Record<string, string>;
  description?: string;
  memoryLimit?: number;
  minScale?: number;
  maxScale?: number;
  timeout?: string;
  privacy?: string;
  domain_name?: string;
  httpOption?: string;
  sandbox?: string;
  privateNetworkId?: string;
  custom_domains?: string[];
  [key: string]: unknown;
}

interface FunctionRecord {
  id: string;
  name: string;
  status?: string;
  handler?: string;
  private_network_id?: string;
  secret_environment_variables?: { key: string; hashed_value: string }[];
  [key: string]: unknown;
}

interface Namespace {
  id: string;
  [key: string]: unknown;
}

interface Runtime {
  name: string;
  language: string;
  status: string;
  statusMessage?: string;
  [key: string]: unknown;
}

interface Logger {
  log(message: string): void;
}

interface CreateFunctionsContext {
  serverless: Serverless;
  provider: ScalewayProvider;
  namespace: Namespace;
  functions: FunctionRecord[];
  listFunctions(namespaceId: string): Promise<FunctionRecord[]>;
  deleteFunction(functionId: string): Promise<FunctionRecord>;
  waitForFunctionStatus(
    functionId: string,
    wantedStatus: string,
  ): Promise<FunctionRecord | undefined>;
  createFunction(params: Record<string, unknown>): Promise<FunctionRecord>;
  updateFunction(
    functionId: string,
    params: Record<string, unknown>,
  ): Promise<FunctionRecord>;
  listRuntimes(): Promise<Runtime[]>;
  listDomainsFunction(
    functionId: string,
  ): Promise<{ id: string; hostname: string }[]>;
  createDomainAndLog(params: Record<string, unknown>): Promise<void>;
  deleteDomain(domainId: string): Promise<{ hostname: string }>;
  createOrUpdateFunctions(
    foundFunctions: FunctionRecord[],
  ): Promise<[unknown[], void]>;
  deleteFunctionsByIds(funcIdsToDelete: string[]): Promise<unknown[]>;
  applyDomainsFunc(
    funcId: string,
    customDomains: string[] | undefined,
  ): Promise<unknown[]>;
  validateRuntime(
    func: FunctionConfig,
    existingRuntimes: Runtime[],
    logger: Logger,
  ): string;
  createSingleFunction(func: FunctionConfig): Promise<FunctionRecord>;
  updateSingleFunction(
    func: FunctionConfig,
    foundFunc: FunctionRecord,
  ): Promise<FunctionRecord>;
  runtime: string;
}

export async function createFunctions(this: CreateFunctionsContext) {
  const functions = await this.listFunctions(this.namespace.id);
  return this.createOrUpdateFunctions(functions);
}

export function deleteFunctionsByIds(
  this: CreateFunctionsContext,
  funcIdsToDelete: string[],
): Promise<unknown[]> {
  const deletePromises = funcIdsToDelete.map((funcIdToDelete) =>
    this.deleteFunction(funcIdToDelete).then((res) => {
      this.serverless.cli.log(
        `Function ${res.name} removed from config file, deleting it...`,
      );
      return this.waitForFunctionStatus(funcIdToDelete, "deleted").then(() => {
        this.serverless.cli.log(`Function ${res.name} deleted`);
      });
    }),
  );

  return Promise.all(deletePromises);
}

export function createOrUpdateFunctions(
  this: CreateFunctionsContext,
  foundFunctions: FunctionRecord[],
): Promise<[unknown[], void]> {
  const functions = this.provider.serverless.service.functions!;

  const deleteData = singleSource.getElementsToDelete(
    this.serverless.configurationInput?.singleSource,
    foundFunctions,
    Object.keys(functions),
  );

  // run create or update promises sequentially (concurrency: 1)
  // to avoid rate limiting, and because these operations are pretty quick (no need for parallelism)
  const updateOrCreateSequentially = async (): Promise<void> => {
    const updatedFunctions: FunctionRecord[] = [];
    for (const functionName of deleteData.serviceNamesRet) {
      const func: FunctionConfig = Object.assign(functions[functionName], {
        name: functionName,
      });

      const foundFunc = foundFunctions.find((f) => f.name === func.name);

      updatedFunctions.push(
        await (foundFunc
          ? this.updateSingleFunction(func, foundFunc)
          : this.createSingleFunction(func)),
      );
    }

    this.functions = updatedFunctions;
  };

  return Promise.all([
    this.deleteFunctionsByIds(deleteData.elementsIdsToRemove),
    updateOrCreateSequentially(),
  ]);
}

export function applyDomainsFunc(
  this: CreateFunctionsContext,
  funcId: string,
  customDomains: string[] | undefined,
): Promise<unknown[]> {
  // we make a diff to know which domains to add or delete

  return this.listDomainsFunction(funcId).then((domains) => {
    const existingDomains = domainUtils.formatDomainsStructure(domains);
    const domainsToCreate = domainUtils.getDomainsToCreate(
      customDomains,
      existingDomains,
    );
    const domainsIdToDelete = domainUtils.getDomainsToDelete(
      customDomains,
      existingDomains,
    );

    const createPromises = domainsToCreate.map((newDomain) => {
      const createDomainParams = { function_id: funcId, hostname: newDomain };

      return this.createDomainAndLog(createDomainParams);
    });

    const deletePromises = domainsIdToDelete.map((domainId) =>
      this.deleteDomain(domainId).then((res) => {
        this.serverless.cli.log(`Deleting domain ${res.hostname}`);
      }),
    );

    return Promise.all([...createPromises, ...deletePromises]);
  });
}

export function validateRuntime(
  this: CreateFunctionsContext,
  func: FunctionConfig,
  existingRuntimes: Runtime[],
  logger: Logger,
): string {
  const existingRuntimesGroupedByLanguage = existingRuntimes.reduce(
    (r, a) => {
      r[a.language] = r[a.language] || [];
      r[a.language].push(a);
      return r;
    },
    Object.create(null) as Record<string, Runtime[]>,
  );

  const existingRuntimesByName = Object.values(
    existingRuntimesGroupedByLanguage,
  )
    .flat()
    .reduce(
      (map, r) => {
        map[r.name] = { status: r.status, statusMessage: r.statusMessage };
        return map;
      },
      {} as Record<string, { status: string; statusMessage?: string }>,
    );

  const currentRuntime = func.runtime || this.runtime;

  if (Object.keys(existingRuntimesByName).includes(currentRuntime)) {
    const runtime = existingRuntimesByName[currentRuntime];

    switch (runtime.status) {
      case RUNTIME_STATUS_AVAILABLE:
        return currentRuntime;

      case RUNTIME_STATUS_EOL:
        logger.log(`Runtime ${currentRuntime} is in End Of Life. Functions that use this runtime will still be working, but it is no more possible to update them.
Note : ${runtime.statusMessage}

Runtime lifecycle doc : https://www.scaleway.com/en/docs/compute/functions/reference-content/functions-lifecycle/#available-runtimes

          `);
        return currentRuntime;

      case RUNTIME_STATUS_EOS:
        logger.log(`Runtime ${currentRuntime} is in End Of Support. It is no longer possible to create a new function with this runtime; however, functions that already use it can still be updated.
Note : ${runtime.statusMessage}

Runtime lifecycle doc : https://www.scaleway.com/en/docs/compute/functions/reference-content/functions-lifecycle/#available-runtimes

           `);

        return currentRuntime;

      default: {
        let warnMessage = `WARNING: Runtime ${currentRuntime} is in status ${runtime.status}`;
        if (
          runtime.statusMessage !== null &&
          runtime.statusMessage !== undefined &&
          runtime.statusMessage !== ""
        ) {
          warnMessage += `: ${runtime.statusMessage}`;
        }
        logger.log(warnMessage);

        return currentRuntime;
      }
    }
  }

  let errorMessage = `Runtime "${currentRuntime}" does not exist`;
  if (existingRuntimes.length > 0) {
    errorMessage += `, must be one of: ${Object.keys(
      existingRuntimesByName,
    ).join(", ")}`;
  } else {
    errorMessage += ": cannot list runtimes";
  }

  throw new Error(errorMessage);
}

export async function createSingleFunction(
  this: CreateFunctionsContext,
  func: FunctionConfig,
): Promise<FunctionRecord> {
  const params: Record<string, unknown> = {
    name: func.name,
    environment_variables: func.env,
    secret_environment_variables: secrets.convertObjectToModelSecretsArray(
      func.secret,
    ),
    namespace_id: this.namespace.id,
    description: func.description,
    memory_limit: func.memoryLimit,
    min_scale: func.minScale,
    max_scale: func.maxScale,
    timeout: func.timeout,
    handler: func.handler,
    privacy: func.privacy,
    domain_name: func.domain_name,
    http_option: func.httpOption,
    sandbox: func.sandbox,
    private_network_id: func.privateNetworkId,
  };

  const availableRuntimes = await this.listRuntimes();
  params.runtime = this.validateRuntime(
    func,
    availableRuntimes,
    this.serverless.cli,
  );

  // checking if there is custom_domains set on function creation.
  if (func.custom_domains && func.custom_domains.length > 0) {
    this.serverless.cli.log(
      "WARNING: custom_domains are available on function update only. " +
        "Redeploy your function to apply custom domains. Doc : https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/",
    );
  }

  this.serverless.cli.log(`Creating function ${func.name}...`);

  return this.createFunction(params).then((response) =>
    Object.assign(response, { handler: func.handler }),
  );
}

export async function updateSingleFunction(
  this: CreateFunctionsContext,
  func: FunctionConfig,
  foundFunc: FunctionRecord,
): Promise<FunctionRecord> {
  let privateNetworkId = func.privateNetworkId;
  const hasToDeletePrivateNetwork =
    foundFunc.private_network_id && !func.privateNetworkId;
  if (hasToDeletePrivateNetwork) {
    privateNetworkId = "";
  }

  const params: Record<string, unknown> = {
    redeploy: false,
    environment_variables: func.env,
    secret_environment_variables: await secrets.mergeSecretEnvVars(
      foundFunc.secret_environment_variables!,
      secrets.convertObjectToModelSecretsArray(func.secret),
      this.serverless.cli,
    ),
    description: func.description,
    memory_limit: func.memoryLimit,
    min_scale: func.minScale,
    max_scale: func.maxScale,
    timeout: func.timeout,
    handler: func.handler,
    privacy: func.privacy,
    domain_name: func.domain_name,
    http_option: func.httpOption,
    sandbox: func.sandbox,
    private_network_id: privateNetworkId,
  };

  const availableRuntimes = await this.listRuntimes();
  params.runtime = this.validateRuntime(
    func,
    availableRuntimes,
    this.serverless.cli,
  );

  this.serverless.cli.log(`Updating function ${func.name}...`);

  const [updatedFunction] = await Promise.all([
    this.updateFunction(foundFunc.id, params).then((response) =>
      Object.assign(response, { handler: func.handler }),
    ),
    // assign domains
    this.applyDomainsFunc(foundFunc.id, func.custom_domains),
  ]);

  return updatedFunction;
}
