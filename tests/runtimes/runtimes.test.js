'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('../../shared/child-process');
const { getTmpDirPath } = require('../utils/fs');
const { getServiceName, createTestService, sleep } = require('../utils/misc');
const { FunctionApi, RegistryApi, ContainerApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, REGISTRY_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');

const serverlessExec = 'serverless';

const scwRegion = 'nl-ams';
const scwProject = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
const scwToken = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
const devModuleDir = path.resolve(__dirname, '..', '..');
const examplesDir = path.resolve(devModuleDir, 'examples');
let api;
const oldCwd = process.cwd();
const registryApi = new RegistryApi(`${REGISTRY_API_URL}/${scwRegion}/`, scwToken);

const exampleRepositories = fs.readdirSync(examplesDir);

describe.each(exampleRepositories)(
  'test runtimes',
  (runtime) => {
    const runtimeServiceName = getServiceName(runtime);
    const tmpDir = getTmpDirPath();

    let namespace = {};

    const isContainer = ['container', 'container-schedule'].includes(runtime);

    createTestService(tmpDir, oldCwd, {
      devModuleDir,
      templateName: path.resolve(examplesDir, runtime),
      serviceName: runtimeServiceName,
      runCurrentVersion: true,
      serverlessConfigHook: (config) => {
        // use right SCW token and project for the deployment as well as service name
        const newConfig = { ...config };
        newConfig.provider.scwToken = scwToken;
        newConfig.provider.scwProject = scwProject;
        newConfig.provider.scwRegion = scwRegion;
        return newConfig;
      },
    });

    it(`should create service for runtime ${runtime} in tmp directory`, () => {
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
    });

    it(`should deploy service for runtime ${runtime} to scaleway`, async () => {
      process.chdir(tmpDir);
      let options = {};
      if (runtime === 'secrets') {
        options = { env: { PATH: process.env.PATH, ENV_SECRETC: 'valueC', ENV_SECRET3: 'value3' } };
      }
      execSync(`${serverlessExec} deploy`, options);
      // If runtime is container => get container
      if (isContainer) {
        api = new ContainerApi(containerApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(runtimeServiceName);
        namespace.containers = await api.listContainers(namespace.id);
      } else {
        api = new FunctionApi(functionApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(runtimeServiceName);
        namespace.functions = await api.listFunctions(namespace.id);
      }
    });

    it(`should invoke function for runtime ${runtime} from scaleway`, async () => {
      let deployedApplication;
      if (isContainer) {
        deployedApplication = namespace.containers[0];
      } else {
        deployedApplication = namespace.functions[0];
      }
      await sleep(30000);
      const response = await axios.get(`https://${deployedApplication.domain_name}`);
      expect(response.status).to.be.equal(200);

      if (runtime === 'secrets') {
        // wait to be sure that function have been redeployed because namespace have been updated
        await sleep(30000);
        expect(response.data.env_vars).to.eql([
          'env_notSecret1', 'env_notSecretA',
          'env_secret1', 'env_secret2', 'env_secret3',
          'env_secretA', 'env_secretB', 'env_secretC',
        ]);
      }
    });

    it(`should remove service for runtime ${runtime} from scaleway`, async () => {
      process.chdir(tmpDir);
      execSync(`${serverlessExec} remove`);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
    });

    it(`should remove registry namespace for runtime ${runtime} properly`, async () => {
      const response = await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
      expect(response.status).to.be.equal(200);
    });

    process.chdir(oldCwd);
  },
);
