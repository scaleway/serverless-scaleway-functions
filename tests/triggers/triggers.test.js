'use strict';

const path = require('path');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName } = require('../utils/misc');
const { Api, RegistryApi } = require('../../shared/api');
const { createTestService } = require('../utils/misc');
const { FUNCTIONS_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');
const devModuleDir = path.resolve(__dirname, '..', '..');
const scwProject = process.env.SCW_PROJECT;
const scwToken = process.env.SCW_TOKEN;
const apiUrl = FUNCTIONS_API_URL;
let api;
let registryApi;

let oldCwd;

beforeAll(() => {
  oldCwd = process.cwd();
  api = new Api(apiUrl, scwToken);
  registryApi = new RegistryApi(scwToken);
});

afterAll(() => {
  process.chdir(oldCwd);
});

const runtimesToTest = [
  { name: 'nodejs10-schedule', isFunction: true },
  { name: 'container-schedule', isFunction: false },
];

describe.each(runtimesToTest)(
  'Test triggers',
  (runtime) => {
    const runtimeServiceName = getServiceName(runtime.name);
    const tmpDir = getTmpDirPath();
    let namespace = {};

    it(`${runtime.name}: should create function service in tmp directory`, () => {
      const templateName = path.resolve(devModuleDir, 'examples', runtime.name);
      createTestService(tmpDir, {
        templateName,
        devModuleDir,
        serviceName: runtimeServiceName,
        runCurrentVersion: true,
        serverlessConfigHook: (config) => {
          // use right SCW token and project for the deployment as well as service name
          const newConfig = Object.assign({}, config);
          newConfig.provider.scwToken = scwToken;
          newConfig.provider.scwProject = scwProject;
          return newConfig;
        },
      });
      process.chdir(tmpDir);
    });

    it(`${runtime.name}: should deploy function service to scaleway`, async () => {
      execSync(`${serverlessExec} deploy`);
      namespace = await api.getNamespaceFromList(runtimeServiceName);
      namespace.functions = await api.listFunctions(namespace.id);
      namespace.containers = await api.listContainers(namespace.id);
    });

    it(`${runtime.name}: should create cronjob for function`, async () => {
      let deployedApplication = {};
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
      execSync(`${serverlessExec} remove`);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
    });

    it(`${runtime.name}: should throw error invalid schedule`, () => {
      replaceTextInFile('serverless.yml', '1 * * * *', '10 minutes');
      try {
        expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
      } catch (err) {
        // If not try catch, test would fail
      }
    });

    it(`${runtime.name}: should throw error invalid triggerType`, () => {
      replaceTextInFile('serverless.yml', 'schedule:', 'queue:');
      try {
        expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
      } catch (err) {
        // If not try catch, test would fail
      }
    });

    it(`${runtime.name}: should remove registry namespace properly`, async () => {
      const response = await registryApi.deleteRegistryNamespace(
        namespace.registry_namespace_id,
      );
      expect(response.status).to.be.equal(200);
    });
  },
);
