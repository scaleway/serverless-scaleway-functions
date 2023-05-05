'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { expect } = require('chai');

const { execSync } = require('../../shared/child-process');
const { getTmpDirPath } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessRemove, createProject } = require('../utils/misc');

const { FunctionApi, ContainerApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');
const { afterAll, beforeAll, describe, it } = require('@jest/globals');
const { removeProjectById } = require('../utils/clean-up');

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;

let options = {};
options.env = {};
options.env.SCW_SECRET_KEY = scwToken;
options.env.SCW_REGION = scwRegion;

const serverlessExec = path.join('serverless');
const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const containerApiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
const devModuleDir = path.resolve(__dirname, '..', '..');
const examplesDir = path.resolve(devModuleDir, 'examples');
let projectId;
let api;
let namespace = {};
let serviceName;
let templateName;
let tmpDir;
const oldCwd = process.cwd();

const exampleRepositories = fs.readdirSync(examplesDir, { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

beforeAll( async () => {
  await createProject().then((project) => {projectId = project.id;});
  options.env.SCW_DEFAULT_PROJECT_ID = projectId;
});

afterAll( async () => {
  await removeProjectById(projectId).catch();
})

describe.each(exampleRepositories)(
  'test runtimes',
  (runtime) => {

    const isContainer = ['container', 'container-schedule'].includes(runtime);

    it(`should create service for runtime ${runtime} in tmp directory`, () => {
      tmpDir = getTmpDirPath();
      templateName = path.resolve(examplesDir, runtime)
      serviceName = getServiceName(runtime);
      execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
      process.chdir(tmpDir);
      execSync(`npm link ${oldCwd}`);
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);
    });

    it(`should deploy service for runtime ${runtime} to scaleway`, async () => {
      let optionsWithSecrets = options;
      if (runtime === 'secrets') {
        optionsWithSecrets = { env: { ENV_SECRETC: 'valueC', ENV_SECRET3: 'value3' } };
      }
      serverlessDeploy(optionsWithSecrets);
      // If runtime is container => get container
      if (isContainer) {
        api = new ContainerApi(containerApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(serviceName, projectId);
        namespace.containers = await api.listContainers(namespace.id);
      } else {
        api = new FunctionApi(functionApiUrl, scwToken);
        namespace = await api.getNamespaceFromList(serviceName, projectId);
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
      serverlessRemove(options);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
      process.chdir(oldCwd);
    });
  },
);
