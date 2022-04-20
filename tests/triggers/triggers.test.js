'use strict';

const path = require('path');
const fs = require('fs');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, createTestService } = require('../utils/misc');
const { FunctionApi, RegistryApi, ContainerApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, REGISTRY_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');

const serverlessExec = 'serverless';

const oldCwd = process.cwd();
const scwRegion = 'pl-waw';
const scwProject = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
const scwToken = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
const devModuleDir = path.resolve(__dirname, '..', '..');
const examplesDir = path.resolve(devModuleDir, 'examples');
let api;
const registryApi = new RegistryApi(`${REGISTRY_API_URL}/${scwRegion}/`, scwToken);

const runtimesToTest = [
  { name: 'nodejs-schedule', isFunction: true },
  { name: 'container-schedule', isFunction: false },
];

describe.each(runtimesToTest)(
  'test runtimes',
  (runtime) => {
    const runtimeServiceName = getServiceName(runtime.name);
    const tmpDir = getTmpDirPath();

    let namespace = {};

    createTestService(tmpDir, oldCwd, {
      devModuleDir,
      templateName: path.resolve(examplesDir, runtime.name),
      serviceName: runtimeServiceName,
      runCurrentVersion: true,
      serverlessConfigHook: (config) => {
        // use right SCW token and project for the deployment as well as service name
        const newConfig = Object.assign({}, config);
        newConfig.provider.scwToken = scwToken;
        newConfig.provider.scwProject = scwProject;
        newConfig.provider.scwRegion = scwRegion;
        return newConfig;
      },
    });

    it(`${runtime.name}: should create service in tmp directory`, () => {
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
    });

    it(`${runtime.name}: should deploy function service to scaleway`, async () => {
      process.chdir(tmpDir);
      execSync(`${serverlessExec} deploy`);
      if (runtime.isFunction) {
        api = new FunctionApi(functionApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(runtimeServiceName);
        namespace.functions = await api.listFunctions(namespace.id);
      } else {
        api = new ContainerApi(containerApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(runtimeServiceName);
        namespace.containers = await api.listContainers(namespace.id);
      }
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

    process.chdir(oldCwd);
  },
);
