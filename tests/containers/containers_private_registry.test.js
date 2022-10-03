'use strict';

const crypto = require('crypto');
const Docker = require('dockerode');

const docker = new Docker();

const path = require('path');
const fs = require('fs');
const { expect } = require('chai');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessRemove} = require('../utils/misc');
const { ContainerApi, RegistryApi } = require('../../shared/api');
const { CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');
const { execSync, execCaptureOutput } = require('../../shared/child-process');

const serverlessExec = path.join('serverless');

describe('Build and deploy on container with a base image private', () => {
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

  const originalImageRepo = 'python';
  const imageTag = '3-alpine';
  let privateRegistryImageRepo;
  let privateRegistryNamespaceId;

  beforeAll(async () => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new ContainerApi(apiUrl, scwToken);
    registryApi = new RegistryApi(registryApiUrl, scwToken);

    // pull the base image, create a private registry, push it into that registry, and remove the image locally
    // to check that the image is pulled at build time
    const registryName = `private-registry-${crypto.randomBytes(16).toString('hex')}`;
    const privateRegistryNamespace = await registryApi.createRegistryNamespace({name: registryName, project_id: scwProject});
    privateRegistryNamespaceId = privateRegistryNamespace.id;

    privateRegistryImageRepo = `rg.${scwRegion}.scw.cloud/${registryName}/python`;

    await docker.pull(`${originalImageRepo}:${imageTag}`);
    const originalImage = docker.getImage(`${originalImageRepo}:${imageTag}`);
    await originalImage.tag({repo: privateRegistryImageRepo, tag: imageTag});
    const privateRegistryImage = docker.getImage(`${privateRegistryImageRepo}:${imageTag}`);
    await privateRegistryImage.push({
      stream: false,
      username: 'nologin',
      password: scwToken
    });
    await privateRegistryImage.remove();
  });

  afterAll(async () => {
    await registryApi.deleteRegistryNamespace(privateRegistryNamespaceId);
    process.chdir(oldCwd);
  });

  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-container', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
    replaceTextInFile(path.join('my-container', 'Dockerfile'), 'FROM python:3-alpine', `FROM ${privateRegistryImageRepo}:${imageTag}`);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);
  });

  it('should deploy service/container to scaleway', async () => {
    serverlessDeploy();
    namespace = await api.getNamespaceFromList(serviceName, scwProject);
    namespace.containers = await api.listContainers(namespace.id);
    containerName = namespace.containers[0].name;
  });

  it('should invoke container from scaleway', async () => {
    // TODO query function status instead of having an arbitrary sleep
    await sleep(30000);

    const output = execCaptureOutput(serverlessExec, ['invoke', '--function', containerName]);
    expect(output).to.be.equal('{"message":"Hello, World from Scaleway Container !"}');
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
});
