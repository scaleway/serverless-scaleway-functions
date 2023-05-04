'use strict';

const crypto = require('crypto');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

const { expect } = require('chai');
const { beforeAll, describe, it } = require('@jest/globals');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, serverlessDeploy, serverlessRemove, serverlessInvoke, retryPromiseWithDelay, sleep } = require('../utils/misc');
const { AccountApi, ContainerApi, RegistryApi } = require('../../shared/api');
const { execSync } = require('../../shared/child-process');
const { ACCOUNT_API_URL, CONTAINERS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

describe('Build and deploy on container with a base image private', () => {
  const scwRegion = process.env.SCW_REGION;
  const scwToken = process.env.SCW_SECRET_KEY;
  const scwOrganizationId = process.env.SCW_ORGANIZATION_ID;
  const apiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
  const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
  const accountApiUrl = `${ACCOUNT_API_URL}/`;
  const templateName = path.resolve(__dirname, '..', '..', 'examples', 'container');
  const tmpDir = getTmpDirPath();

  let options = {};
  options.env = {};
  options.env.SCW_SECRET_KEY = scwToken;
  options.env.SCW_REGION = scwRegion;

  let oldCwd;
  let serviceName;
  let api;
  let accountApi;
  let registryApi;
  let namespace;
  let project;
  let containerName;

  const originalImageRepo = 'python';
  const imageTag = '3-alpine';
  let privateRegistryImageRepo;
  let privateRegistryNamespaceId;

  beforeAll(async () => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new ContainerApi(apiUrl, scwToken);
    accountApi = new AccountApi(accountApiUrl, scwToken);
    registryApi = new RegistryApi(registryApiUrl, scwToken);

    // Create new project : this can fail because of quotas, so we try multiple times
    try {
      const projectToCreate = accountApi.createProject({
        name: `test-slsframework-${crypto.randomBytes(6)
          .toString('hex')}`,
        organization_id: scwOrganizationId,
      });
      const promise = retryPromiseWithDelay(projectToCreate, 5, 60000);
      project = await Promise.resolve(promise);
      options.env.SCW_DEFAULT_PROJECT_ID = project.id;
    } catch (err) {
      throw err;
    }

    // pull the base image, create a private registry, push it into that registry, and remove the image locally
    // to check that the image is pulled at build time
    const registryName = `private-registry-${crypto.randomBytes(16).toString('hex')}`;
    const privateRegistryNamespace = await registryApi.createRegistryNamespace({name: registryName, project_id: project.id});
    privateRegistryNamespaceId = privateRegistryNamespace.id;

    privateRegistryImageRepo = `rg.${scwRegion}.scw.cloud/${registryName}/python`;

    const docker = new Docker();
    const pullStream = await docker.pull(`${originalImageRepo}:${imageTag}`).then();
    // Wait for pull to finish
    await new Promise(res => docker.modem.followProgress(pullStream, res));
    const originalImage = await docker.getImage(`${originalImageRepo}:${imageTag}`);
    await originalImage.tag({repo: privateRegistryImageRepo, tag: imageTag});
    const privateRegistryImage = docker.getImage(`${privateRegistryImageRepo}:${imageTag}`);
    await privateRegistryImage.push({
      stream: false,
      username: 'nologin',
      password: scwToken
    });
    await privateRegistryImage.remove();
  });

  it('should create service in tmp directory', async () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-container', serviceName);
    replaceTextInFile(path.join('my-container', 'Dockerfile'), 'FROM python:3-alpine', `FROM ${privateRegistryImageRepo}:${imageTag}`);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);
  });

  it('should deploy service/container to scaleway', async () => {
    serverlessDeploy(options);
    namespace = await api.getNamespaceFromList(serviceName, project.id);
    namespace.containers = await api.listContainers(namespace.id);
    containerName = namespace.containers[0].name;
  });

  it('should invoke container from scaleway', async () => {
    await api.waitContainersAreDeployed(namespace.id);
    options.serviceName = containerName;
    const output = serverlessInvoke(options).toString();
    expect(output).to.be.equal('{"message":"Hello, World from Scaleway Container !"}');
  });

  it('should remove service from scaleway', async () => {
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
  });
});
