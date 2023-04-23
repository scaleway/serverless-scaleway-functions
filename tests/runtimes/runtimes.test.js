'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { expect } = require('chai');
const { getTmpDirPath } = require('../utils/fs');
const { getServiceName, createTestService, sleep, serverlessDeploy, serverlessRemove} = require('../utils/misc');

const { AccountApi, FunctionApi, RegistryApi, ContainerApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, REGISTRY_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');
const { afterAll, beforeAll, describe, it } = require('@jest/globals');
const crypto = require('crypto');

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;
const scwOrganizationId = process.env.SCW_ORGANIZATION_ID;

let options = {};
options.env = {};
options.env.SCW_SECRET_KEY = scwToken;
options.env.SCW_REGION = scwRegion;

const tmpDir = getTmpDirPath();
const accountApiUrl = `${ACCOUNT_API_URL}`;
const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
const registryApi = new RegistryApi(`${REGISTRY_API_URL}/${scwRegion}/`, scwToken);
const devModuleDir = path.resolve(__dirname, '..', '..');
const examplesDir = path.resolve(devModuleDir, 'examples');
let api;
let accountApi;
let namespace = {};
let project;
let runtimeServiceName;
const oldCwd = process.cwd();

const exampleRepositories = fs.readdirSync(examplesDir);

beforeAll( async () => {
  accountApi = new AccountApi(accountApiUrl, scwToken);
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
  process.chdir(oldCwd);
});

describe.each(exampleRepositories)(
  'test runtimes',
  (runtime) => {

    runtimeServiceName = getServiceName(runtime);
    createTestService(tmpDir, oldCwd, {
      devModuleDir,
      templateName: path.resolve(examplesDir, runtime),
      serviceName: runtimeServiceName,
      runCurrentVersion: true,
    });

    const isContainer = ['container', 'container-schedule'].includes(runtime);

    it(`should create service for runtime ${runtime} in tmp directory`, () => {
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
    });

    it(`should deploy service for runtime ${runtime} to scaleway`, async () => {
      process.chdir(tmpDir);
      let optionsWithSecrets = options;
      if (runtime === 'secrets') {
        optionsWithSecrets = { env: { ENV_SECRETC: 'valueC', ENV_SECRET3: 'value3' } };
      }
      serverlessDeploy(optionsWithSecrets);
      // If runtime is container => get container
      if (isContainer) {
        api = new ContainerApi(containerApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(runtimeServiceName, project.id);
        namespace.containers = await api.listContainers(namespace.id);
      } else {
        api = new FunctionApi(functionApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(runtimeServiceName, project.id);
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
      serverlessRemove(options);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
    });

    it(`should remove registry namespace for runtime ${runtime} properly`, async () => {
      await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
      const response = await api.waitNamespaceIsDeleted(namespace.registry_namespace_id);
      expect(response).to.be.equal(true);
    });
  },
);
