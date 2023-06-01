'use strict';

const fs = require('fs');
const path = require('path');

const { describe, it, expect } = require('@jest/globals');

const { execSync } = require('../../shared/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, serverlessDeploy, serverlessRemove, serverlessInvoke, createProject } = require('../utils/misc');
const { FunctionApi } = require('../../shared/api');
const { FUNCTIONS_API_URL } = require('../../shared/constants');
const { removeProjectById } = require('../utils/clean-up');

const serverlessExec = path.join('serverless');

const scwToken = process.env.SCW_SECRET_KEY;

const functionTemplateName = path.resolve(__dirname, '..', '..', 'examples', 'python3');
const oldCwd = process.cwd();
const serviceName = getServiceName();

const regions = ['fr-par', 'nl-ams', 'pl-waw'];

describe("test regions", () => {

  it.concurrent.each(regions)(
  'region %s',
  async (region) => {

      let options = {};
      options.env = {};
      options.env.SCW_SECRET_KEY = scwToken;

      let projectId, api, namespace, apiUrl;

      // should create project
      // not in beforeAll because of a known bug between concurrent tests and async beforeAll
      await createProject().then((project) => {projectId = project.id;}).catch((err) => console.error(err));
      options.env.SCW_DEFAULT_PROJECT_ID = projectId;

      // should create working directory
      const tmpDir = getTmpDirPath();
      execSync(`${serverlessExec} create --template-path ${functionTemplateName} --path ${tmpDir}`);
      process.chdir(tmpDir);
      execSync(`npm link ${oldCwd}`);
      replaceTextInFile('serverless.yml', 'scaleway-python3', serviceName);
      expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).toEqual(true);
      expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).toEqual(true);

      // should deploy service for region ${region}
      apiUrl = `${FUNCTIONS_API_URL}/${region}`;
      api = new FunctionApi(apiUrl, scwToken);
      options.env.SCW_REGION = region;
      serverlessDeploy(options);
      namespace = await api.getNamespaceFromList(serviceName, projectId).catch((err) => console.error(err));
      namespace.functions = await api.listFunctions(namespace.id).catch((err) => console.error(err));

      // should invoke service for region ${region}
      const deployedFunction = namespace.functions[0];
      expect(deployedFunction.domain_name.split('.')[3]).toEqual(region);
      options.serviceName = deployedFunction.name;
      const output = serverlessInvoke(options).toString();
      expect(output).toEqual('"Hello From Python3 runtime on Serverless Framework and Scaleway Functions"');

      // should remove service for region ${region}
      serverlessRemove(options);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).toEqual(404);
      }

      // should remove project
      await removeProjectById(projectId).catch((err) => console.error(err));
    },
  );
})
