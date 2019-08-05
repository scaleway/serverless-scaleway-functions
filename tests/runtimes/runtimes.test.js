'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath } = require('../utils/fs');
const { getServiceName, createTestService, sleep } = require('../utils/misc');
const { Api, RegistryApi } = require('../../shared/api');
const { FUNCTIONS_API_URL } = require('../../shared/constants');

const serverlessExec = 'serverless';

let oldCwd;
const scwOrganization = process.env.SCW_ORGANIZATION;
const scwToken = process.env.SCW_TOKEN;
const apiUrl = process.env.SCW_URL || FUNCTIONS_API_URL;
const examplesDir = path.resolve(__dirname, '..', '..', 'examples');
let api;
let registryApi;

beforeAll(() => {
  oldCwd = process.cwd();
  api = new Api(apiUrl, scwToken);
  registryApi = new RegistryApi(scwToken);
});

afterAll(() => {
  process.chdir(oldCwd);
});

const exampleRepositories = fs.readdirSync(examplesDir);

describe.each(exampleRepositories)(
  'test runtimes',
  (runtime) => {
    const runtimeServiceName = getServiceName(runtime);
    const tmpDir = getTmpDirPath();
    let namespace = {};

    createTestService(tmpDir, {
      templateName: path.resolve(examplesDir, runtime),
      serviceName: runtimeServiceName,
      serverlessConfigHook: (config) => {
        // use right SCW token and organization for the deployment as well as service name
        const newConfig = Object.assign({}, config);
        newConfig.provider.scwToken = scwToken;
        newConfig.provider.scwOrganization = scwOrganization;
        return newConfig;
      },
    });

    it(`should create service for runtime ${runtime} in tmp directory`, () => {
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
    });

    it(`should deploy service for runtime ${runtime} to scaleway`, async () => {
      process.chdir(tmpDir);
      execSync(`${serverlessExec} deploy`);
      namespace = await api.getNamespaceFromList(runtimeServiceName);
      // If runtime is container => get container
      if (runtime === 'container') {
        namespace.containers = await api.listContainers(namespace.id);
      } else {
        namespace.functions = await api.listFunctions(namespace.id);
      }
    });

    it(`should invoke function for runtime ${runtime} from scaleway`, async () => {
      let deployedApplication;
      if (runtime === 'container') {
        deployedApplication = namespace.containers[0];
      } else {
        deployedApplication = namespace.functions[0];
      }
      await sleep(6000);
      const response = await axios.get(deployedApplication.endpoint);
      expect(response.status).to.be.equal(200);
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
  },
);
