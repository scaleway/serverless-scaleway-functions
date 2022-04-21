'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep } = require('../utils/misc');
const { FunctionApi, RegistryApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

describe('Service Lifecyle Integration Test', () => {
  const templateName = path.resolve(__dirname, '..', '..', 'examples', 'nodejs');
  const tmpDir = getTmpDirPath();
  let oldCwd;
  let serviceName;
  const scwRegion = 'fr-par';
  const scwProject = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
  const scwToken = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
  const apiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
  const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
  let api;
  let registryApi;
  let namespace;

  beforeAll(() => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new FunctionApi(apiUrl, scwToken);
    registryApi = new RegistryApi(registryApiUrl, scwToken);
  });

  afterAll(() => {
    process.chdir(oldCwd);
  });

  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-nodeXX', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
    replaceTextInFile('serverless.yml', '<scw-region>', scwRegion);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to scaleway', async () => {
    execSync(`${serverlessExec} deploy`);
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.functions = await api.listFunctions(namespace.id);
  });

  it('should invoke function from scaleway', async () => {
    await sleep(30000);
    const deployedFunction = namespace.functions[0];
    const response = await axios.get(`https://${deployedFunction.domain_name}`);
    expect(response.data.message).to.be.equal('Hello from Serverless Framework and Scaleway Functions :D');
  });

  it('should deploy updated service to scaleway', () => {
    const newHandler = `
        'use strict';

        module.exports.handle = (event, context, cb) => {
          return {
            body: { message: 'Serverless Update Succeeded' }
          };
        }
      `;

    fs.writeFileSync(path.join(tmpDir, 'handler.js'), newHandler);
    execSync(`${serverlessExec} deploy`);
  });

  it('should invoke updated function from scaleway', async () => {
    await sleep(30000);
    const deployedFunction = namespace.functions[0];
    const response = await axios.get(`https://${deployedFunction.domain_name}`);
    expect(response.data.body.message).to.be.equal('Serverless Update Succeeded');
  });

  it('should remove service from scaleway', async () => {
    execSync(`${serverlessExec} remove`);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
  });

  it('should remove registry namespace properly', async () => {
    const response = await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
    expect(response.status).to.be.equal(200);
  });

  it('should throw error handler not found', () => {
    replaceTextInFile('serverless.yml', 'handler.handle', 'doesnotexist.handle');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
    replaceTextInFile('serverless.yml', 'doesnotexist.handle', 'handler.handle');
  });

  it('should throw error runtime does not exist', () => {
    replaceTextInFile('serverless.yml', 'node16', 'doesnotexist');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });
});
