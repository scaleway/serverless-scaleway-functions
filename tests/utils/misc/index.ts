import path from "path";
import crypto from "crypto";

import { execSync } from "../../../shared/child-process";
import { readYamlFile, writeYamlFile } from "../fs";
import { AccountApi } from "../../../shared/api";
import { ACCOUNT_API_URL } from "../../../shared/constants";

// shared/api/index.js is still CommonJS (deliberately deferred - see
// docs/typescript-migration.md), so AccountApi resolves to `any` here; this
// local interface covers only what this file's own logic reads off its
// createProject() result.
interface Project {
  id: string;
  name: string;
}

interface ExecOptions {
  env?: Record<string, string | undefined>;
  serviceName?: string;
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

const testServiceIdentifier = "scwtestsls";

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
  process.chdir(tmpDir);

  // Install our local version of this repo
  // If this is not the first time this has been run, or the repo is already linked for development, this requires --force
  execSync(`npm link --force ${repoDir}`);

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

async function createProject(): Promise<Project> {
  const accountApi = new AccountApi(ACCOUNT_API_URL, secretKey!);

  // Unfortunately, there's a small delay between the creation of a project and its availability for API calls.
  // We wait 1 minute to ensure there's no issue with IAM cache.
  const project: Project = await accountApi.createProject({
    name: `test-slsframework-${crypto.randomBytes(6).toString("hex")}`,
    organization_id: organizationId!,
  });

  console.log(
    `Project ${project.name} created, waiting for it to be available...`,
  );

  await sleep(60000);

  console.log(`Project ${project.name} is now available.`);

  return project;
}

export {
  logger,
  testServiceIdentifier,
  serverlessExec,
  getServiceName,
  serverlessDeploy,
  serverlessInvoke,
  serverlessRemove,
  createTestService,
  sleep,
  createProject,
};
