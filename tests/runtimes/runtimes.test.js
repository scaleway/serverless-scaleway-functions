'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { expect } = require('chai');

const { execSync } = require('../../shared/child-process');
const { getTmpDirPath } = require('../utils/fs');
const { getServiceName, serverlessDeploy, serverlessRemove, createProject, sleep } = require('../utils/misc');

const { FunctionApi } = require('../../shared/api');
const { FUNCTIONS_API_URL } = require('../../shared/constants');
const { describe, it } = require('@jest/globals');
const { removeProjectById } = require('../utils/clean-up');

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;

let options = {};
options.env = {};
options.env.SCW_SECRET_KEY = scwToken;
options.env.SCW_REGION = scwRegion;

const serverlessExec = path.join('serverless');
const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const devModuleDir = path.resolve(__dirname, '..', '..');
const examplesDir = path.resolve(devModuleDir, 'examples');
let projectId;
let api;
let namespace = {};
let serviceName;
let templateName;
let tmpDir;
const oldCwd = process.cwd();

/* Some examples are already indirectly tested in other tests, so we don't test them again here. For
* example, container-schedule and nodejs-schedule are tested in triggers, python3 in multi_regions,
* etc... */
const exampleRepositories = [
  'go', 'multiple', 'nodejs-es-modules', 'php', 'rust', 'secrets'
]

describe("test runtimes", () => {

  it.concurrent.each(exampleRepositories)(
    'test runtimes %s',
    async (runtime) => {

      // Should create project
      await createProject().then((project) => {projectId = project.id;});
      options.env.SCW_DEFAULT_PROJECT_ID = projectId;

      // should create service for runtime ${runtime} in tmp directory
      tmpDir = getTmpDirPath();
      templateName = path.resolve(examplesDir, runtime)
      serviceName = getServiceName(runtime);
      execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
      process.chdir(tmpDir);
      execSync(`npm link ${oldCwd}`);
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).to.be.equal(true);

      // should deploy service for runtime ${runtime} to scaleway
      let optionsWithSecrets = options;
      if (runtime === 'secrets') {
        optionsWithSecrets = { env: { ENV_SECRETC: 'valueC', ENV_SECRET3: 'value3' } };
      }
      serverlessDeploy(optionsWithSecrets);
      api = new FunctionApi(functionApiUrl, scwToken);
      namespace = await api.getNamespaceFromList(serviceName, projectId);
      namespace.functions = await api.listFunctions(namespace.id);

      // should invoke function for runtime ${runtime} from scaleway
      let deployedApplication;
      await sleep(30000);
      deployedApplication = namespace.functions[0];
      const response = await axios.get(`https://${deployedApplication.domain_name}`);
      expect(response.status).to.be.equal(200);

      if (runtime === 'secrets') {
        expect(response.data.env_vars).to.eql([
          'env_notSecret1', 'env_notSecretA',
          'env_secret1', 'env_secret2', 'env_secret3',
          'env_secretA', 'env_secretB', 'env_secretC',
        ]);
      }

      // should remove service for runtime ${runtime} from scaleway
      serverlessRemove(options);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
      process.chdir(oldCwd);

      // Should delete project
      await sleep(60000); // registry lag
      await removeProjectById(projectId).catch();

    },
  );
})
