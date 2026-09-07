import path from "path";
import crypto from "crypto";

import { execSync } from "../../../shared/child-process";
import { readYamlFile, writeYamlFile } from "../fs";
import { AccountApi } from "../../../shared/api";
import { ACCOUNT_API_URL } from "../../../shared/constants";
import { withRetry } from "../../../shared/retry";

// shared/api/index.js is still CommonJS (deliberately deferred - see
// docs/typescript-migration.md), so AccountApi resolves to `any` here; this
// local interface covers only what this file's own logic reads off its
// createProject() result.
interface Project {
  id: string;
  name: string;
}

interface TestProject {
  id: string;
  // false when this project was newly created by this call (the caller
  // owns its lifecycle and should remove it when done); true when an
  // existing project was reused instead (the caller must never remove it).
  usingExistingProject: boolean;
}

interface ExecOptions {
  env?: Record<string, string | undefined>;
  serviceName?: string;
  cwd?: string;
  [key: string]: unknown;
}

interface CreateTestServiceOptions {
  devModuleDir?: string;
  templateName?: string;
  serviceName?: string | null;
  serverlessConfigHook?:
    ((config: Record<string, unknown>) => Record<string, unknown>) | null;
  runCurrentVersion?: boolean;
}

const logger = console;

// NOT "scwtestsls" - a registry namespace name starting with "scw" requires
// a separate, additional IAM permission beyond what creating a Containers/
// Functions namespace itself needs (confirmed live, 2026-08-28: identical
// credentials that can create a Container namespace on a project get
// PermissionsDeniedError "write api_admin_namespace" only when the derived
// Registry namespace name is "scw"-prefixed). Every generated test service/
// namespace name derives from this constant, so dropping the prefix here
// avoids the extra grant entirely instead of requiring it on every
// credential this test suite might run under (this repo's CI included).
const testServiceIdentifier = "testsls";

const serverlessExec = "serverless";

const project = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
const organizationId = process.env.SCW_ORGANIZATION_ID;
const secretKey = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
const region = process.env.SCW_REGION;

function getServiceName(identifier = ""): string {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${identifier}${hrtime[1]}`;
}

function mergeOptionsWithEnv(options?: ExecOptions): ExecOptions {
  if (!options) {
    options = {};
  }
  if (!options.env) {
    options.env = {};
  }

  options.env.PATH = process.env.PATH;
  // execSync's `env` replaces the child's environment rather than merging
  // with this process's own - without this, shared/api/sdkClient.ts's
  // verbose fetch logging (tests/setup-tests.js) is invisible for every
  // `serverless deploy`/`invoke`/`remove` child process, which is exactly
  // where the interesting failures (createNamespace, waitNamespaceIsReady,
  // createFunctions' listFunctions check, etc) actually happen - confirmed
  // live in CI (2026-08-31): a PermissionsDeniedError inside one of those
  // calls had no corresponding [scalewayFetch] log line at all.
  if (process.env.SCW_FETCH_DEBUG) {
    options.env.SCW_FETCH_DEBUG = process.env.SCW_FETCH_DEBUG;
  }

  if (!options.env.SCW_DEFAULT_PROJECT_ID) {
    options.env.SCW_DEFAULT_PROJECT_ID = project;
  }
  if (!options.env.SCW_SECRET_KEY) {
    options.env.SCW_SECRET_KEY = secretKey;
  }
  if (!options.env.SCW_REGION) {
    options.env.SCW_REGION = region;
  }

  return options;
}

function serverlessDeploy(options?: ExecOptions): Buffer | string {
  options = mergeOptionsWithEnv(options);
  return execSync(`${serverlessExec} deploy`, options);
}

function serverlessInvoke(options?: ExecOptions): Buffer | string {
  options = mergeOptionsWithEnv(options);
  return execSync(
    `${serverlessExec} invoke --function ${options.serviceName}`,
    options,
  );
}

function isDnsNotFoundError(err: unknown): boolean {
  const { stdout, stderr } = (err ?? {}) as {
    stdout?: Buffer;
    stderr?: Buffer;
  };
  const text = `${stdout?.toString() ?? ""}${stderr?.toString() ?? ""}`;
  return text.includes("ENOTFOUND");
}

// Confirmed live (2026-08-28, tests/containers/containers_private_registry.test.js
// and tests/multi-region/multi_region.test.js): invoking a function/container
// right after its deploy prints "Domains for X have been deployed!" can
// still fail with `getaddrinfo ENOTFOUND <its own public endpoint>` -
// production code's own domain-deploy wait (shared/api/domain.ts) only
// confirms the Domain resource's own API status, not that the DNS record
// has actually propagated to a resolver yet.
//
// invoke/scalewayInvoke.ts's own doInvoke() catches that same axios error,
// writes it to stderr, and does NOT rethrow or set a non-zero exit code -
// `serverless invoke` exits 0 with empty stdout on a failed invoke (verified
// by reading that file directly). So `execSync` never throws here either;
// the DNS failure surfaces only as an empty result, not an exception. Every
// caller of this helper already treats a non-empty string as the sole
// success signal (several assert `.not.toEqual("")` directly), so retrying
// on an empty result is safe and matches every call site's actual intent -
// this isn't limited to the DNS case specifically, since an empty exit-0
// result can't be distinguished from one programmatically anyway (stderr
// text isn't captured on a non-throwing execSync call).
//
// Still retries a *thrown* error too, but only for that specific DNS
// failure (any other thrown error - a broken handler, a genuinely wrong
// response - is a real result and should surface immediately, not be
// masked by retrying).
async function serverlessInvokeWithRetry(
  options?: ExecOptions,
): Promise<Buffer | string> {
  return withRetry(async () => serverlessInvoke(options), {
    maxAttempts: 6,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    isRetryable: isDnsNotFoundError,
    shouldRetryResult: (result) => result.toString().length === 0,
  });
}

function serverlessRemove(options?: ExecOptions): Buffer | string {
  options = mergeOptionsWithEnv(options);
  return execSync(`${serverlessExec} remove`, options);
}

function createTestService(
  tmpDir: string,
  repoDir: string,
  options: CreateTestServiceOptions = {
    devModuleDir: "",
    templateName: "nodejs10", // Name of the template inside example directory to use for test service
    serviceName: null,
    serverlessConfigHook: null, // Eventual hook that allows to customize serverless config
    runCurrentVersion: false,
  },
): Record<string, unknown> {
  const serviceName = options.serviceName || getServiceName();

  if (!options.templateName) {
    throw new Error("Template Name must be provided to create a test service");
  }

  // create a new Serverless service
  execSync(
    `${serverlessExec} create --template-path ${options.templateName} --path ${tmpDir}`,
  );
  // Deliberately NOT process.chdir(tmpDir) here - triggers.test.js and
  // runtimes.test.js both call this from an it.concurrent.each case, and
  // process.chdir() mutates global, process-wide state: one concurrent
  // case's chdir could silently redirect another's later relative-path
  // operations into the wrong tmpDir while it's mid-await (the same race
  // multi_region.test.js was fixed for). Give the npm link call an explicit
  // cwd instead, which is immune to a sibling case changing the process's
  // cwd out from under it.
  //
  // Install our local version of this repo
  // If this is not the first time this has been run, or the repo is already linked for development, this requires --force
  execSync(`npm link --force ${repoDir}`, { cwd: tmpDir });

  const serverlessFilePath = path.join(tmpDir, "serverless.yml");
  let serverlessConfig = readYamlFile(serverlessFilePath) as Record<
    string,
    unknown
  >;
  // Ensure unique service name
  serverlessConfig.service = serviceName;
  if (options.serverlessConfigHook) {
    serverlessConfig = options.serverlessConfigHook(serverlessConfig);
  }
  writeYamlFile(serverlessFilePath, serverlessConfig);

  return serverlessConfig;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface NamespaceApiLike {
  getNamespaceFromList(
    namespaceName: string,
    projectId: string | undefined,
  ): Promise<unknown>;
}

// Confirmed live (PR #334 CI, tests/functions/functions.test.js): a plain
// `api.getNamespaceFromList(serviceName, projectId)` called immediately
// after `serverlessDeploy()` returns can come back empty even though the
// deploy just printed the function's real, working URL - a read-after-write
// consistency gap on a namespace that (per createProject()'s own comment
// below on this general class of race) was itself only just created for
// this test run. Every test
// file doing this same "deploy, then look the namespace up by name from a
// separate client" pattern is equally exposed, so this lives here once
// rather than being fixed per-file.
//
// Also retries a thrown error (not just an empty result) on every attempt
// but the last - confirmed live (2026-08-28, tests/triggers/triggers.test.js)
// that a raw network blip (`TypeError: fetch failed` / `SocketError: other
// side closed`, most likely from running several live suites in parallel
// against this same machine) can hit this exact call. That's not a
// "namespace doesn't exist" signal to react to, but it shouldn't abort the
// whole retry budget on attempt 1 either when 5 more attempts remain.
async function getNamespaceFromListWithRetry(
  api: NamespaceApiLike,
  namespaceName: string,
  projectId: string | undefined,
): Promise<unknown> {
  return withRetry(() => api.getNamespaceFromList(namespaceName, projectId), {
    maxAttempts: 6,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    shouldRetryResult: (namespace) => !namespace,
  });
}

interface NamespaceGetApiLike {
  getNamespace(namespaceId: string): Promise<unknown>;
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 404
  );
}

// Confirmed live (2026-08-28): calling getNamespace() on a namespace right
// after serverlessRemove() returns can still find it - with status
// "deleting", not yet a 404 - even though production code's own
// waitNamespaceIsDeleted() (shared/api/namespaces.ts) already polled its own
// client until it saw a genuine 404 before ever printing "Namespace has been
// deleted successfully". That confirmation happened on a separate client
// connection (the `serverless remove` child process) from this test's own
// `api` instance, so it doesn't rule out a short-lived read-after-delete
// consistency lag on this client's own connection - the same class of gap
// getNamespaceFromListWithRetry() above works around for creation. This
// exact "await getNamespace(); catch (err) => expect(err.status).toBe(404)"
// shape is duplicated identically across every integration test file, so it
// lives here once rather than being fixed per-file.
//
// A non-404 error also gets retried (up to the last attempt) rather than
// thrown immediately - confirmed live (2026-08-28) that this exact call can
// hit a raw network blip (`TypeError: fetch failed` / `SocketError: other
// side closed`, most likely from running several live suites in parallel
// against this same machine), which isn't a "still exists" signal but
// shouldn't burn the whole retry budget on attempt 1 either.
async function isNamespaceRemoved(
  api: NamespaceGetApiLike,
  namespaceId: string,
): Promise<boolean> {
  const { removed } = await withRetry(
    async () => {
      try {
        await api.getNamespace(namespaceId);
        return { removed: false };
      } catch (err) {
        if (isNotFoundError(err)) return { removed: true };
        throw err;
      }
    },
    {
      maxAttempts: 6,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      shouldRetryResult: (r) => !r.removed,
    },
  );
  return removed;
}

// No artificial wait here, deliberately - history worth knowing before
// changing this again. Originally a blind 60s sleep ("wait 1 minute to
// ensure there's no issue with IAM cache"), never actually verified.
// Replaced with an active probe (a single retried FunctionApi.listNamespaces
// call) after verifying live it typically clears in under a second - but
// that probe only proves one specific read call, in one region, has caught
// up, not a write (createNamespace) or a different read
// (FunctionApi.listFunctions, confirmed live to actually validate
// namespace/project existence unlike listNamespaces) elsewhere. Replaced
// again with a flat 10s sleep after confirming live in CI that removing the
// 60s buffer measurably increased how often a real deploy hit Scaleway's
// central-to-regional project sync race on some *other* call shortly after
// createProject() returned. That flat wait is removed here, for now, in
// favor of tests/setup-tests.js's new verbose per-request SDK logging: the
// goal right now is to observe the raw race directly (which exact call
// 403s, how long after creation, how often) instead of guessing at a delay
// that happens to paper over it. Expect this function to change again once
// that observation informs a real fix (per-attempt transient-error
// tolerance at each at-risk call site, most likely).
async function createProject(): Promise<Project> {
  const accountApi = new AccountApi(ACCOUNT_API_URL, secretKey!);

  const project: Project = await accountApi.createProject({
    name: `test-slsframework-${crypto.randomBytes(6).toString("hex")}`,
    organization_id: organizationId!,
  });

  console.log(`Project ${project.name} created.`);

  return project;
}

// Test mode: if SCW_DEFAULT_PROJECT_ID (or its legacy alias SCW_PROJECT) is
// already set, reuse that project instead of creating a fresh ephemeral one
// via createProject(). Matters for credentials that can't create or list
// projects org-wide - a project-scoped API key, for which
// createProject()'s own AccountApi call would otherwise fail outright.
//
// Callers MUST branch on `usingExistingProject` before ever removing a
// project by id - a shared existing project must never be torn down just
// because one test run is done with it. Callers running multiple test
// cases against a shared existing project must also run them
// *sequentially*, not concurrently (see e.g.
// tests/triggers/triggers.test.js's runRuntimeTests): unlike an ephemeral
// per-run project, a shared project's resources (registry namespace
// naming, MNQ activation, etc.) can collide across concurrent test cases
// the way they can't when each case gets its own isolated project.
async function resolveTestProject(): Promise<TestProject> {
  if (project) {
    return { id: project, usingExistingProject: true };
  }
  const created = await createProject();
  return { id: created.id, usingExistingProject: false };
}

// Same decision resolveTestProject() makes, but synchronous and available
// at module-load time - for callers that need to pick concurrent vs.
// sequential test execution *before* any test body runs (e.g.
// tests/triggers/triggers.test.js's it.concurrent.each vs it.each), which
// resolveTestProject()'s async result can't inform in time.
const isUsingExistingTestProject = Boolean(project);

export {
  logger,
  testServiceIdentifier,
  serverlessExec,
  getServiceName,
  serverlessDeploy,
  serverlessInvoke,
  serverlessInvokeWithRetry,
  serverlessRemove,
  createTestService,
  sleep,
  createProject,
  resolveTestProject,
  isUsingExistingTestProject,
  getNamespaceFromListWithRetry,
  isNamespaceRemoved,
};
