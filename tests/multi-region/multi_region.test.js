'use strict';

const fs = require('fs');
const path = require('path');

const { expect } = require('chai');
const { afterAll, beforeAll, describe, it } = require('@jest/globals');

const { execSync } = require('../../shared/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, serverlessDeploy, serverlessRemove, serverlessInvoke, createProject } = require('../utils/misc');
const { FunctionApi } = require('../../shared/api');
const { FUNCTIONS_API_URL } = require('../../shared/constants');
const { removeProjectById } = require('../utils/clean-up');

const serverlessExec = path.join('serverless');

const scwToken = process.env.SCW_SECRET_KEY;

let options = {};
options.env = {};
options.env.SCW_SECRET_KEY = scwToken;

const functionTemplateName = path.resolve(__dirname, '..', '..', 'examples', 'python3');
const oldCwd = process.cwd();
const serviceName = getServiceName();
let projectId;
let apiUrl;
let api;
let namespace;

const regions = ['fr-par', 'nl-ams', 'pl-waw'];

beforeAll( async () => {
  await createProject().then((project) => {projectId = project.id;});
  options.env.SCW_DEFAULT_PROJECT_ID = projectId;
});

afterAll( async () => {
  await removeProjectById(projectId).catch();
})

describe.each(regions)(
  'test regions',
  (region) => {

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
      options.env.SCW_REGION = region;
      serverlessDeploy(options);
      namespace = await api.getNamespaceFromList(serviceName, projectId);
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
  },
);
