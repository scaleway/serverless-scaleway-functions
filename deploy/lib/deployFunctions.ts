const DEPLOY_FUNCTIONS_CONCURRENCY = 5; // max number of functions deployed at a time

// Runs iteratee over items with at most `concurrency` calls in flight at
// once, preserving result order. Native Promise has no built-in bounded-
// concurrency map (Promise.all runs everything at once); this is a small
// worker-pool: each worker pulls the next unclaimed index until none remain.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  iteratee: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iteratee(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}

interface FunctionRecord {
  id: string;
  name: string;
  domain_name?: string;
  runtime_message?: string;
  [key: string]: unknown;
}

interface DomainRecord {
  id: string;
  hostname: string;
  [key: string]: unknown;
}

interface DeployFunctionsContext {
  serverless: { cli: { log(message: string): void } };
  functions: FunctionRecord[];
  deployFunction(
    functionId: string,
    params: Record<string, unknown>,
  ): Promise<FunctionRecord>;
  waitForFunctionStatus(
    functionId: string,
    wantedStatus: string,
  ): Promise<FunctionRecord | undefined>;
  waitDomainsAreDeployedFunction(functionId: string): Promise<DomainRecord[]>;
  deployEachFunction(): Promise<void[]>;
  printFunctionInformationAfterDeployment(
    func: FunctionRecord | undefined,
  ): FunctionRecord | undefined;
  waitForDomainsDeployment(func: FunctionRecord | undefined): Promise<void>;
}

export async function deployFunctions(
  this: DeployFunctionsContext,
): Promise<void[]> {
  this.serverless.cli.log("Deploying Functions...");
  return this.deployEachFunction();
}

export function deployEachFunction(
  this: DeployFunctionsContext,
): Promise<void[]> {
  return mapWithConcurrency(
    this.functions,
    DEPLOY_FUNCTIONS_CONCURRENCY,
    (func) => {
      return this.deployFunction(func.id, {})
        .then((func) => {
          this.serverless.cli.log(`Deploying ${func.name}...`);
          return func;
        })
        .then((func) => this.waitForFunctionStatus(func.id, "ready"))
        .then((func) => this.printFunctionInformationAfterDeployment(func))
        .then((func) => this.waitForDomainsDeployment(func));
    },
  );
}

export function printFunctionInformationAfterDeployment(
  this: DeployFunctionsContext,
  func: FunctionRecord | undefined,
): FunctionRecord | undefined {
  this.serverless.cli.log(
    `Function ${func!.name} has been deployed to: https://${func!.domain_name}`,
  );

  if (func!.runtime_message !== undefined && func!.runtime_message !== "") {
    this.serverless.cli.log(`Runtime information : ${func!.runtime_message}`);
  }

  return func;
}

export function waitForDomainsDeployment(
  this: DeployFunctionsContext,
  func: FunctionRecord | undefined,
): Promise<void> {
  this.serverless.cli.log(`Waiting for ${func!.name} domains deployment...`);

  return this.waitDomainsAreDeployedFunction(func!.id).then((domains) => {
    domains.forEach((domain) => {
      this.serverless.cli.log(
        `Domain ready (${func!.name}): ${domain.hostname}`,
      );
    });
    this.serverless.cli.log(`Domains for ${func!.name} have been deployed!`);
  });
}
