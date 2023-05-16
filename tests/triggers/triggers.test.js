'use strict';

const fs = require('fs');
const path = require('path');

const { expect } = require('chai');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, serverlessDeploy, serverlessRemove, createTestService, createProject, sleep } = require('../utils/misc');

const { FunctionApi, ContainerApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');
const { describe, it } = require('@jest/globals');
const { execSync } = require('../../shared/child-process');
const { removeProjectById } = require('../utils/clean-up');

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;

const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;

const devModuleDir = path.resolve(__dirname, '..', '..');
const oldCwd = process.cwd();
const examplesDir = path.resolve(devModuleDir, 'examples');

const runtimesToTest = [
  { name: 'nodejs-schedule', isFunction: true },
  { name: 'container-schedule', isFunction: false },
];

describe("test triggers", () => {

  it.concurrent.each(runtimesToTest)(
  'triggers for %s',
  async (runtime) => {

    let options = {};
    options.env = {};
    options.env.SCW_SECRET_KEY = scwToken;
    options.env.SCW_REGION = scwRegion;

    let projectId;
    let api;
    let namespace = {};

    // should create project
    // not in beforeAll because of a known bug between concurrent tests and async beforeAll
    await createProject()
      .then((project) => {projectId = project.id;})
      .catch((err) => console.error(err));
    options.env.SCW_DEFAULT_PROJECT_ID = projectId;

    // should create service in tmp directory
    const tmpDir = getTmpDirPath();
    const serviceName = getServiceName(runtime.name);
    createTestService(tmpDir, oldCwd, {
      devModuleDir,
      templateName: path.resolve(examplesDir, runtime.name),
      serviceName: serviceName,
      runCurrentVersion: true,
    });
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);

    // should deploy function service to scaleway
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    serverlessDeploy(options);
    if (runtime.isFunction) {
      api = new FunctionApi(functionApiUrl, scwToken);
      namespace = await api.getNamespaceFromList(serviceName, projectId).catch((err) => console.error(err));
      namespace.functions = await api.listFunctions(namespace.id).catch((err) => console.error(err));
    } else {
      api = new ContainerApi(containerApiUrl, scwToken);
      namespace = await api.getNamespaceFromList(serviceName, projectId).catch((err) => console.error(err));
      namespace.containers = await api.listContainers(namespace.id).catch((err) => console.error(err));
    }

    // should create cronjob for function
    let deployedApplication;
    if (runtime.isFunction) {
      deployedApplication = namespace.functions[0];
    } else {
      deployedApplication = namespace.containers[0];
    }
    const deployedTriggers = await api.listTriggersForApplication(deployedApplication.id).catch((err) => console.error(err));

    expect(deployedTriggers.length).to.be.equal(1);
    expect(deployedTriggers[0].args.myInput).to.be.equal('myValue');
    expect(deployedTriggers[0].args.mySecondInput).to.be.equal(1);
    expect(deployedTriggers[0].schedule).to.be.equal('1 * * * *');

    // should remove services from scaleway
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }

    // should throw error invalid schedule
    replaceTextInFile('serverless.yml', '1 * * * *', '10 minutes');
    try {
      expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }

    // should throw error invalid triggerType
    replaceTextInFile('serverless.yml', 'schedule:', 'queue:');
    try {
      expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }

    // should remove project
    await removeProjectById(projectId).catch((err) => console.error(err));
  });
})
