'use strict';

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { expect } = require('chai');
const { afterAll, beforeAll, describe, it } = require('@jest/globals');

const { execSync } = require('../../shared/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessRemove,
  serverlessInvoke
} = require('../utils/misc');
const { AccountApi, FunctionApi, RegistryApi } = require('../../shared/api');
const { ACCOUNT_API_URL, FUNCTIONS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

const scwToken = process.env.SCW_SECRET_KEY;
const scwOrganizationId = process.env.SCW_ORGANIZATION_ID;
const accountApiUrl = `${ACCOUNT_API_URL}`;

let options = {};
options.env = {};
options.env.SCW_SECRET_KEY = scwToken;

const functionTemplateName = path.resolve(__dirname, '..', '..', 'examples', 'python3');
const oldCwd = process.cwd();
const serviceName = getServiceName();
let apiUrl;
let api;
let accountApi;
let namespace;
let project;

const regions = ['fr-par', 'nl-ams', 'pl-waw'];

describe.each(regions)(
  'test regions',
  (region) => {

    beforeAll( async () => {
      accountApi = new AccountApi(accountApiUrl, scwToken);
      // Create new project
      options.env.SCW_REGION = region;
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

    it('should create service in tmp directory', () => {
      const tmpDir = getTmpDirPath();

      // create working directory
      execSync(`${serverlessExec} create --template-path ${functionTemplateName} --path ${tmpDir}`);
      process.chdir(tmpDir);
      execSync(`npm link ${oldCwd}`);
      replaceTextInFile('serverless.yml', 'scaleway-python3', serviceName);
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).to.be.equal(true);
    });

    it (`should deploy service for region ${region}`, async () => {
      apiUrl = `${FUNCTIONS_API_URL}/${region}`;
      api = new FunctionApi(apiUrl, scwToken);
      serverlessDeploy(options);
      namespace = await api.getNamespaceFromList(serviceName, project.id);
      namespace.functions = await api.listFunctions(namespace.id);
    });

    it(`should invoke service for region ${region}`, async () => {
      const deployedFunction = namespace.functions[0];
      expect(deployedFunction.domain_name.split('.')[3]).to.be.equal(region);
      options.serviceName = deployedFunction.name;
      const output = serverlessInvoke(options).toString();
      expect(output).to.be.equal('"Hello From Python3 runtime on Serverless Framework and Scaleway Functions"');
    });

    it(`should remove service for region ${region}`, async () => {
      serverlessRemove(options);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
    });

    it (`should remove registry namespace properly for region ${region}`, async () => {
      const registryApiUrl = `${REGISTRY_API_URL}/${region}/`;
      const registryApi = new RegistryApi(registryApiUrl, scwToken);
      await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
      const response = await api.waitNamespaceIsDeleted(namespace.registry_namespace_id);
      expect(response).to.be.equal(true);
    });

  },
);
