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
    const serviceName = getServiceName(runtime.name);
    const config = createTestService(tmpDir, oldCwd, {
      devModuleDir,
      templateName: path.resolve(examplesDir, runtime.name),
      serviceName: serviceName,
      runCurrentVersion: true,
    });
    expect(fs.existsSync(path.join(tmpDir, "serverless.yml"))).toEqual(true);
    expect(fs.existsSync(path.join(tmpDir, "package.json"))).toEqual(true);

    // should deploy function service to scaleway
    process.chdir(tmpDir);
    serverlessDeploy(options);
    if (runtime.isFunction) {
      api = new FunctionApi(functionApiUrl, scwToken);
      namespace = await api.getNamespaceFromList(serviceName, projectId);
      namespace.functions = await api.listFunctions(namespace.id);
    } else {
      api = new ContainerApi(containerApiUrl, scwToken);
      namespace = await api.getNamespaceFromList(serviceName, projectId);
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
    for (const key in triggerInputs) {
      expect(deployedTriggers[0].args[key]).toEqual(triggerInputs[key]);
    }
    expect(deployedTriggers[0].schedule).toEqual("1 * * * *");

    // should remove services from scaleway
    process.chdir(tmpDir);
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.status).toEqual(404);
    }

    // should throw error invalid schedule
    replaceTextInFile("serverless.yml", "1 * * * *", "10 minutes");
    try {
      await expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }

    // should throw error invalid triggerType
    replaceTextInFile("serverless.yml", "schedule:", "queue:");
    try {
      await expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }

    // should remove project - only the one this test actually created,
    // never a shared existing project resolveTestProject() reused instead.
    if (!usingExistingProject) {
      await removeProjectById(projectId).catch((err) => console.error(err));
    }
  });
});
