'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { expect } = require('chai');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, serverlessDeploy, serverlessRemove, sleep, createTestService } = require('../utils/misc');

const { AccountApi, FunctionApi, RegistryApi, ContainerApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, REGISTRY_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');
const { afterAll, beforeAll, describe, it } = require('@jest/globals');

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;
const scwOrganizationId = process.env.SCW_ORGANIZATION_ID;

let options = {};
options.env = {};
options.env.SCW_SECRET_KEY = scwToken;
options.env.SCW_REGION = scwRegion;

const serverlessExec = path.join('serverless');
const accountApiUrl = `${ACCOUNT_API_URL}`;
const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
const devModuleDir = path.resolve(__dirname, '..', '..');
const oldCwd = process.cwd();
const examplesDir = path.resolve(devModuleDir, 'examples');
let api;
let namespace = {};
let project;
let templateName;
let serviceName;
let tmpDir;
const accountApi = new AccountApi(accountApiUrl, scwToken);
const registryApi = new RegistryApi(`${REGISTRY_API_URL}/${scwRegion}/`, scwToken);

const runtimesToTest = [
  { name: 'nodejs-schedule', isFunction: true },
  { name: 'container-schedule', isFunction: false },
];

beforeAll( async () => {
  // Create new project
  project = await accountApi.createProject({
    name: `test-slsframework-${crypto.randomBytes(6).toString('hex')}`,
    organization_id: scwOrganizationId,
  })
  options.env.SCW_DEFAULT_PROJECT_ID = project.id;
});

afterAll( async () => {
  // TODO: remove sleep and use a real way to find out when all resources are actually deleted
  await sleep(60000);
  await accountApi.deleteProject(project.id);
});

describe.each(runtimesToTest)(
  'test triggers',
  (runtime) => {

    it(`${runtime.name}: should create service in tmp directory`, () => {
      tmpDir = getTmpDirPath();
      templateName = path.resolve(examplesDir, runtime.name)
      serviceName = getServiceName(runtime.name);
      createTestService(tmpDir, oldCwd, {
        devModuleDir,
        templateName: path.resolve(examplesDir, runtime.name),
        serviceName: serviceName,
        runCurrentVersion: true,
      });
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
    });

    it(`${runtime.name}: should deploy function service to scaleway`, async () => {
      process.chdir(tmpDir);
      serverlessDeploy(options);
      if (runtime.isFunction) {
        api = new FunctionApi(functionApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(serviceName, project.id);
        namespace.functions = await api.listFunctions(namespace.id);
      } else {
        api = new ContainerApi(containerApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(serviceName, project.id);
        namespace.containers = await api.listContainers(namespace.id);
      }
    });

    it(`${runtime.name}: should create cronjob for function`, async () => {
      let deployedApplication;
      if (runtime.isFunction) {
        deployedApplication = namespace.functions[0];
      } else {
        deployedApplication = namespace.containers[0];
      }
      const deployedTriggers = await api.listTriggersForApplication(deployedApplication.id);

      expect(deployedTriggers.length).to.be.equal(1);
      expect(deployedTriggers[0].args.myInput).to.be.equal('myValue');
      expect(deployedTriggers[0].args.mySecondInput).to.be.equal(1);
      expect(deployedTriggers[0].schedule).to.be.equal('1 * * * *');
    });

    it(`${runtime.name}: should remove services from scaleway`, async () => {
      serverlessRemove(options);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
    });

    it(`${runtime.name}: should throw error invalid schedule`, () => {
      replaceTextInFile('serverless.yml', '1 * * * *', '10 minutes');
      try {
        expect(serverlessDeploy(options)).rejects.toThrow(Error);
      } catch (err) {
        // If not try catch, test would fail
      }
    });

    it(`${runtime.name}: should throw error invalid triggerType`, () => {
      replaceTextInFile('serverless.yml', 'schedule:', 'queue:');
      try {
        expect(serverlessDeploy(options)).rejects.toThrow(Error);
      } catch (err) {
        // If not try catch, test would fail
      }
    });

    it(`${runtime.name}: should remove registry namespace properly`, async () => {
      await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
      const response = await api.waitNamespaceIsDeleted(namespace.registry_namespace_id);
      expect(response).to.be.equal(true);
      process.chdir(oldCwd);
    });
  },
);
