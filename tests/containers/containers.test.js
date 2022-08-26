'use strict';

const path = require('path');
const fs = require('fs');
const { expect } = require('chai');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessRemove} = require('../utils/misc');
const { ContainerApi, RegistryApi } = require('../../shared/api');
const { CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');
const { execSync, execCaptureOutput } = require('../../shared/child-process');

const serverlessExec = path.join('serverless');

describe('Service Lifecyle Integration Test', () => {
  const templateName = path.resolve(__dirname, '..', '..', 'examples', 'container');
  const tmpDir = getTmpDirPath();
  let oldCwd;
  let serviceName;
  const scwRegion = process.env.SCW_REGION;
  const scwProject = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
  const scwToken = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
  const apiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
  const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
  let api;
  let registryApi;
  let namespace;
  let containerName;

  beforeAll(() => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new ContainerApi(apiUrl, scwToken);
    registryApi = new RegistryApi(registryApiUrl, scwToken);
  });

  afterAll(() => {
    process.chdir(oldCwd);
  });

  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-container', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);
  });

  it('should deploy service/container to scaleway', async () => {
    serverlessDeploy();
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.containers = await api.listContainers(namespace.id);
    containerName = namespace.containers[0].name;
  });

  it('should invoke container from scaleway', async () => {
    // TODO query function status instead of having an arbitrary sleep
    await sleep(30000);

    let output = execCaptureOutput(serverlessExec, ['invoke', '--function', containerName]);
    expect(output).to.be.equal('{"message":"Hello, World from Scaleway Container !"}');
  });

  it('should deploy updated service/container to scaleway', () => {
    replaceTextInFile('my-container/server.py', 'Hello, World from Scaleway Container !', 'Container successfully updated');
    serverlessDeploy();
  });

  it('should invoke updated container from scaleway', async () => {
    await sleep(30000);

    let output = execCaptureOutput(serverlessExec, ['invoke', '--function', containerName]);
    expect(output).to.be.equal('{"message":"Container successfully updated"}');
  });

  it('should remove service from scaleway', async () => {
    serverlessRemove();
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
      expect(serverlessDeploy()).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });
});
