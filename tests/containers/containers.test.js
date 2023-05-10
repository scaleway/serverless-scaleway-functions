'use strict';

const path = require('path');
const fs = require('fs');
const { expect } = require('chai');
const Docker = require('dockerode');
const tar = require('tar-fs');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessRemove,
  serverlessInvoke
} = require('../utils/misc');
const { ContainerApi, RegistryApi } = require('../../shared/api');
const { CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');
const { execSync, execCaptureOutput } = require('../../shared/child-process');
const { it } = require('@jest/globals');

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
  const descriptionTest = 'slsfw test description';
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
    replaceTextInFile('serverless.yml', '# description: ""', `description: "${descriptionTest}"`);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);
  });

  it('should deploy service/container to scaleway', async () => {
    serverlessDeploy();
    namespace = await api.getNamespaceFromList(serviceName, scwProject);
    namespace.containers = await api.listContainers(namespace.id);
    expect(namespace.containers[0].description).to.be.equal(descriptionTest);
    containerName = namespace.containers[0].name;
  });

  it('should replace container image with test image', async () => {
    // This tests will push a dummy image to the same namespace of the deployed
    // container. And then it will modify the image through the API.
    // After that we run a serverless deploy to ensure the container image
    // is NOT the dummy image.

    // build a new image with same path but different name for testing.
    const regImg = namespace.containers[0].registry_image;
    const contName = namespace.containers[0].name;
    const imageName = regImg.replace(contName, 'test-container');

    const docker = new Docker();

    // used for pushing
    const auth = {
      username: 'any',
      password: scwToken,
    };

    const regEndpoint = `rg.${scwRegion}.scw.cloud`;
    const registryAuth = {};
    registryAuth[regEndpoint] = {
      username: 'any',
      password: scwToken,
    };

    await docker.checkAuth(registryAuth);

    const tarStream = tar.pack(path.join(tmpDir, 'my-container'));

    await docker.buildImage(tarStream, { t: imageName, registryconfig: registryAuth });

    const image = docker.getImage(imageName);

    await image.push(auth);

    const params = {
      redeploy: false,
      registry_image: imageName,
    };

    // registry lag
    await sleep(30000);

    await api.updateContainer(namespace.containers[0].id, params);

    const nsContainers = await api.listContainers(namespace.id);

    expect(nsContainers[0].registry_image).to.be.equal(imageName);

    serverlessDeploy();

    const nsContainersAfterSlsDeploy = await api.listContainers(namespace.id);

    expect(nsContainersAfterSlsDeploy[0].registry_image).to.not.contains('test-container');
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

  it('should deploy with registry image specified', () => {
    replaceTextInFile('serverless.yml', '# registryImage: ""', 'registryImage: docker.io/library/nginx:latest');
    replaceTextInFile('serverless.yml', '# port: 8080', 'port: 80');
    serverlessDeploy();
  });

  it('should invoke updated container with specified registry image', async () => {
    await sleep(30000);
    let output = execCaptureOutput(serverlessExec, ['invoke', '--function', containerName]);
    expect(output).to.contain('Welcome to nginx!');
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
