'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep } = require('../utils/misc');
const { FunctionApi, ContainerApi, RegistryApi } = require('../../shared/api');
const { REGISTRY_API_URL, FUNCTIONS_API_URL, CONTAINERS_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

describe('Deploy in multiple regions', () => {
  const functionTemplateName = path.resolve(__dirname, '..', '..', 'examples', 'python3');
  const containerTemplateName = path.resolve(__dirname, '..', '..', 'examples', 'container');
  let oldCwd;
  let serviceName;
  const scwProject = process.env.SCW_PROJECT;
  const scwToken = process.env.SCW_TOKEN;
  let apiUrl;
  let api;
  let namespace;

  beforeAll(() => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
  });

  afterAll(() => {
    process.chdir(oldCwd);
  });

  it('should deploy function in nl-ams region', async () => {
    const scwRegion = 'nl-ams';
    const tmpDir = getTmpDirPath();

    // create working directory
    execSync(`${serverlessExec} create --template-path ${functionTemplateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-python3', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
    replaceTextInFile('serverless.yml', '<scw-region>', scwRegion);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'handler.py'))).to.be.equal(true);

    // deploy function
    apiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
    api = new FunctionApi(apiUrl, scwToken);
    execSync(`${serverlessExec} deploy`);
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.functions = await api.listFunctions(namespace.id);

    // Invoke function
    await sleep(6000);
    const deployedFunction = namespace.functions[0];
    expect(deployedFunction.domain_name.split('.')[3]).to.be.equal(scwRegion);
    let response = await axios.get(`https://${deployedFunction.domain_name}`);
    expect(response.data.message).to.be.equal('Hello From Python3 runtime on Serverless Framework and Scaleway Functions');

    // delete function
    execSync(`${serverlessExec} remove`);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
    const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
    const registryApi = new RegistryApi(registryApiUrl, scwToken);
    response = await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
    expect(response.status).to.be.equal(200);
  });

  it('should deploy container in pl-waw region', async () => {
    const scwRegion = 'pl-waw';
    const tmpDir = getTmpDirPath();

    // create working directory
    execSync(`${serverlessExec} create --template-path ${containerTemplateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync('npm i');
    replaceTextInFile('serverless.yml', 'scaleway-container', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
    replaceTextInFile('serverless.yml', '<scw-region>', scwRegion);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'my-container'))).to.be.equal(true);

    // deploy container
    apiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
    api = new ContainerApi(apiUrl, scwToken);
    execSync(`${serverlessExec} deploy`);
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.containers = await api.listContainers(namespace.id);

    // Invoke container
    await sleep(6000);
    const deployedContainer = namespace.containers[0];
    expect(deployedContainer.domain_name.split('.')[3]).to.be.equal(scwRegion);
    let response = await axios.get(`https://${deployedContainer.domain_name}`);
    expect(response.data.message).to.be.equal('Hello, World from Scaleway Container !');

    // delete container
    execSync(`${serverlessExec} remove`);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
    const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
    const registryApi = new RegistryApi(registryApiUrl, scwToken);
    response = await registryApi.deleteRegistryNamespace(namespace.registry_namespace_id);
    expect(response.status).to.be.equal(200);
  });
});
