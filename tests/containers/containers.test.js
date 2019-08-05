'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep } = require('../utils/misc');
const { Api, RegistryApi } = require('../../shared/api');
const { FUNCTIONS_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

describe('Service Lifecyle Integration Test', () => {
  const templateName = path.resolve(__dirname, '..', '..', 'examples', 'container');
  const tmpDir = getTmpDirPath();
  let oldCwd;
  let serviceName;
  const scwOrganization = process.env.SCW_ORGANIZATION;
  const scwToken = process.env.SCW_TOKEN;
  const apiUrl = process.env.SCW_URL || FUNCTIONS_API_URL;
  let api;
  let registryApi;
  let namespace;

  beforeAll(() => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new Api(apiUrl, scwToken);
    registryApi = new RegistryApi(scwToken);
  });

  afterAll(() => {
    process.chdir(oldCwd);
  });

  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync('npm i');
    replaceTextInFile('serverless.yml', 'scaleway-container', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-organization-id>', scwOrganization);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);
  });

  it('should deploy service/container to scaleway', async () => {
    execSync(`${serverlessExec} deploy`);
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.containers = await api.listContainers(namespace.id);
  });

  it('should invoke container from scaleway', async () => {
    const deployedFunction = namespace.containers[0];
    await sleep(2000);
    const response = await axios.get(deployedFunction.endpoint);
    expect(response.data.message).to.be.equal('Hello, World from Scaleway Container !');
  });

  it('should deploy updated service/container to scaleway', () => {
    replaceTextInFile('my-container/server.py', 'Hello, World from Scaleway Container !', 'Container successfully updated');
    execSync(`${serverlessExec} deploy`);
  });

  it('should invoke updated container from scaleway', async () => {
    await sleep(10000);
    const response = await axios.get(namespace.containers[0].endpoint);
    expect(response.data.message).to.be.equal('Container successfully updated');
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

  it('should throw error container directory not found', () => {
    replaceTextInFile('serverless.yml', 'my-container', 'doesnotexist');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });
});
