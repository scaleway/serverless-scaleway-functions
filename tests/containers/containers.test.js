'use strict';

const crypto = require('crypto');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const tar = require('tar-fs');

const { expect } = require('chai');
const { afterAll, beforeAll, describe, it } = require('@jest/globals');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep, serverlessDeploy, serverlessInvoke, serverlessRemove, retryPromiseWithDelay } = require('../utils/misc');
const { AccountApi, ContainerApi } = require('../../shared/api');
const { execSync } = require('../../shared/child-process');
const { ACCOUNT_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');
const { removeProjectById } = require('../utils/clean-up');

const serverlessExec = path.join('serverless');

describe('Service Lifecyle Integration Test', () => {
  const scwRegion = process.env.SCW_REGION;
  const scwToken = process.env.SCW_SECRET_KEY;
  const scwOrganizationId = process.env.SCW_ORGANIZATION_ID;
  const apiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
  const accountApiUrl = `${ACCOUNT_API_URL}`;
  const templateName = path.resolve(__dirname, '..', '..', 'examples', 'container');
  const tmpDir = getTmpDirPath();

  let options = {};
  options.env = {};
  options.env.SCW_SECRET_KEY = scwToken;
  options.env.SCW_REGION = scwRegion;

  let oldCwd;
  let serviceName;
  const descriptionTest = 'slsfw test description';
  let api;
  let accountApi;
  let namespace;
  let containerName;
  let project;

  beforeAll(async () => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new ContainerApi(apiUrl, scwToken);
    accountApi = new AccountApi(accountApiUrl, scwToken);

    // Create new project : this can fail because of quotas, so we try multiple times
    const projectToCreate = accountApi.createProject({
      name: `test-slsframework-${crypto.randomBytes(6)
        .toString('hex')}`,
      organization_id: scwOrganizationId,
    });
    const promise = retryPromiseWithDelay(projectToCreate, 5, 60000);
    await Promise.resolve(promise)
      .then(options.env.SCW_DEFAULT_PROJECT_ID = project.id)
      .catch(err => console.error(err));
  });

  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-container', serviceName);
    replaceTextInFile('serverless.yml', '# description: ""', `description: "${descriptionTest}"`);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);
  });

  it('should deploy service/container to scaleway', async () => {
    serverlessDeploy(options);
    namespace = await api.getNamespaceFromList(serviceName, project.id);
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
    registryAuth[regEndpoint] = auth;

    await docker.checkAuth(registryAuth);

    const tarStream = tar.pack(path.join(tmpDir, 'my-container'));

    await docker.buildImage(tarStream, { t: imageName, registryconfig: registryAuth });
    const image = docker.getImage(imageName);
    await image.push(auth);

    // registry lag
    await sleep(60000);

    const params = {
      redeploy: false,
      registry_image: imageName,
    };
    await api.updateContainer(namespace.containers[0].id, params);

    const nsContainers = await api.listContainers(namespace.id);
    expect(nsContainers[0].registry_image).to.be.equal(imageName);

    serverlessDeploy(options);

    const nsContainersAfterSlsDeploy = await api.listContainers(namespace.id);
    expect(nsContainersAfterSlsDeploy[0].registry_image).to.not.contains('test-container');
  });

  it('should invoke container from scaleway', async () => {
    await api.waitContainersAreDeployed(namespace.id);
    options.serviceName = containerName;
    const output = serverlessInvoke(options).toString();
    expect(output).to.be.equal('{"message":"Hello, World from Scaleway Container !"}');
  });

  it('should deploy updated service/container to scaleway', () => {
    replaceTextInFile('my-container/server.py', 'Hello, World from Scaleway Container !', 'Container successfully updated');
    serverlessDeploy(options);
  });

  it('should invoke updated container from scaleway', async () => {
    await api.waitContainersAreDeployed(namespace.id);
    const output = serverlessInvoke(options).toString();
    expect(output).to.be.equal('{"message":"Container successfully updated"}');
  });

  it('should remove service from scaleway', async () => {
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
  });

  // TODO: handle error at validation time
  // ATM, error is thrown when trying to build the image because the directory is not found,
  // instead, we should check at validation time if the directory exists (if not, we create
  // a namespace resource for nothing, preventing to delete the project afterwards)
  /*it('should throw error container directory not found', () => {
    replaceTextInFile('serverless.yml', 'my-container', 'doesnotexist');
    try {
      expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });*/
});
