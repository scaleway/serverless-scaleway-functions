'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('../../shared/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessRemove} = require('../utils/misc');
const { FunctionApi, RegistryApi } = require('../../shared/api');
const { REGISTRY_API_URL, FUNCTIONS_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

const functionTemplateName = path.resolve(__dirname, '..', '..', 'examples', 'python3');
const oldCwd = process.cwd();
const serviceName = getServiceName();
const scwProject = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
const scwToken = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
let apiUrl;
let api;
let namespace;

const regions = ['fr-par', 'nl-ams', 'pl-waw'];

describe.each(regions)(
  'test regions',
  (region) => {
    it(`should deploy service for region ${region}`, async () => {
      const tmpDir = getTmpDirPath();

      // create working directory
      execSync(`${serverlessExec} create --template-path ${functionTemplateName} --path ${tmpDir}`);
      process.chdir(tmpDir);
      execSync(`npm link ${oldCwd}`);
      replaceTextInFile('serverless.yml', 'scaleway-python3', serviceName);
      replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
      replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).to.be.equal(true);

      // deploy function
      apiUrl = `${FUNCTIONS_API_URL}/${region}`;
      api = new FunctionApi(apiUrl, scwToken);
      serverlessDeploy({ env: { SCW_REGION: region } });
      namespace = await api.getNamespaceFromList(serviceName);
      namespace.functions = await api.listFunctions(namespace.id);

      // Invoke function
      await sleep(30000);
      const deployedFunction = namespace.functions[0];
      expect(deployedFunction.domain_name.split('.')[3]).to.be.equal(region);
      let response = await axios.get(`https://${deployedFunction.domain_name}`);
      expect(response.data.message).to.be.equal('Hello From Python3 runtime on Serverless Framework and Scaleway Functions');

      // delete function
      serverlessRemove({ env: { SCW_REGION: region } });
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).to.be.equal(404);
      }
      const registryApiUrl = `${REGISTRY_API_URL}/${region}/`;
      const registryApi = new RegistryApi(registryApiUrl, scwToken);
      response = await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
      expect(response.status).to.be.equal(200);

      process.chdir(oldCwd);
    });
  },
);
