"use strict";

const fs = require("fs");
const path = require("path");

const { getTmpDirPath, replaceTextInFile } = require("../utils/fs");
const {
  getServiceName,
  serverlessDeploy,
  serverlessRemove,
  resolveTestProject,
  isUsingExistingTestProject,
  createTestService,
  getNamespaceFromListWithRetry,
  isNamespaceRemoved,
} = require("../utils/misc");

const { FunctionApi, ContainerApi } = require("../../shared/api");
const {
  FUNCTIONS_API_URL,
  CONTAINERS_API_URL,
} = require("../../shared/constants");
const { removeProjectById } = require("../utils/clean-up");

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;

const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;

const devModuleDir = path.resolve(__dirname, "..", "..");
const oldCwd = process.cwd();
const examplesDir = path.resolve(devModuleDir, "examples");

const runtimesToTest = [
  { name: "nodejs-schedule", isFunction: true },
  { name: "container-schedule", isFunction: false },
];

// A shared existing project's resources (registry namespace naming, MNQ
// activation, etc.) can collide across concurrent test cases the way they
// can't when each case gets its own isolated project - so when
// resolveTestProject() below is going to reuse an existing project instead
// of creating one, these run sequentially instead of concurrently. The
// `it`/`it.concurrent` split has to happen at this static call-site level
// (Jest has no per-case "concurrent unless..." toggle), so it reads the
// same synchronous check resolveTestProject() itself uses.
const runRuntimeTests = isUsingExistingTestProject
  ? it.each(runtimesToTest)
  : it.concurrent.each(runtimesToTest);

describe("test triggers", () => {
  runRuntimeTests("triggers for %s", async (runtime) => {
    let options = {};
    options.env = {};
    options.env.SCW_SECRET_KEY = scwToken;
    options.env.SCW_REGION = scwRegion;

    let projectId, api;
    let namespace;

    // should create project
    // not in beforeAll because of a known bug between concurrent tests and async beforeAll
    const testProject = await resolveTestProject();
    projectId = testProject.id;
    const usingExistingProject = testProject.usingExistingProject;
    options.env.SCW_DEFAULT_PROJECT_ID = projectId;

    // should create service in tmp directory
    const tmpDir = getTmpDirPath();
    // Deliberately using an explicit cwd on every exec below instead of
    // process.chdir(tmpDir) - runRuntimeTests runs concurrently
    // (it.concurrent.each) unless isUsingExistingTestProject forces the
    // sequential path, and process.chdir() mutates global, process-wide
    // state that a concurrent sibling case's chdir could clobber mid-await
    // (same race multi_region.test.js was fixed for).
    options.cwd = tmpDir;
    const serverlessYmlPath = path.join(tmpDir, "serverless.yml");
    const serviceName = getServiceName(runtime.name);
    const config = createTestService(tmpDir, oldCwd, {
      devModuleDir,
      templateName: path.resolve(examplesDir, runtime.name),
      serviceName: serviceName,
      runCurrentVersion: true,
    });
    expect(fs.existsSync(serverlessYmlPath)).toEqual(true);
    expect(fs.existsSync(path.join(tmpDir, "package.json"))).toEqual(true);

    // should deploy function service to scaleway
    serverlessDeploy(options);
    if (runtime.isFunction) {
      api = new FunctionApi(functionApiUrl, scwToken);
      namespace = await getNamespaceFromListWithRetry(
        api,
        serviceName,
        projectId,
      );
      namespace.functions = await api.listFunctions(namespace.id);
    } else {
      api = new ContainerApi(containerApiUrl, scwToken);
      namespace = await getNamespaceFromListWithRetry(
        api,
        serviceName,
        projectId,
      );
      namespace.containers = await api.listContainers(namespace.id);
    }

    // should create cronjob for function
    let deployedApplication;
    let triggerInputs;
    if (runtime.isFunction) {
      deployedApplication = namespace.functions[0];
      triggerInputs = config.functions.first.events[0].schedule.input;
    } else {
      deployedApplication = namespace.containers[0];
      triggerInputs = config.custom.containers.first.events[0].schedule.input;
    }
    const deployedTriggers = await api.listTriggersForApplication(
      deployedApplication.id,
      runtime.isFunction,
    );

    expect(deployedTriggers.length).toEqual(1);
    // Functions (v1beta1) keep the old Cron.args shape; Containers (v1)
    // dropped it entirely - the same schedule.input value is instead
    // JSON-encoded into cronConfig.body as the cron's HTTP request body
    // (see shared/api/triggers.ts's createCronTrigger). Confirmed against
    // the live API (2026-08-28): a container's listed trigger has no
    // top-level `args` at all, only `cronConfig.body`.
    if (runtime.isFunction) {
      for (const key in triggerInputs) {
        expect(deployedTriggers[0].args[key]).toEqual(triggerInputs[key]);
      }
    } else {
      const body = JSON.parse(deployedTriggers[0].cronConfig.body);
      for (const key in triggerInputs) {
        expect(body[key]).toEqual(triggerInputs[key]);
      }
    }
    expect(deployedTriggers[0].schedule).toEqual("1 * * * *");

    // should remove services from scaleway
    serverlessRemove(options);
    expect(await isNamespaceRemoved(api, namespace.id)).toBe(true);

    // should throw error invalid schedule
    // serverlessDeploy() is a synchronous execSync() wrapper - it throws
    // directly, not a rejected Promise - so `expect(...).rejects` here was
    // dead code: whichever branch ran (deploy throwing as expected, or
    // Jest's own "not a promise" error when it unexpectedly didn't), the
    // outer try/catch silently swallowed it before any real assertion ran.
    replaceTextInFile(serverlessYmlPath, "1 * * * *", "10 minutes");
    expect(() => serverlessDeploy(options)).toThrow();

    // should throw error invalid triggerType
    replaceTextInFile(serverlessYmlPath, "schedule:", "queue:");
    expect(() => serverlessDeploy(options)).toThrow();

    // should remove project - only the one this test actually created,
    // never a shared existing project resolveTestProject() reused instead.
    if (!usingExistingProject) {
      await removeProjectById(projectId).catch((err) => console.error(err));
    }
  });
});
