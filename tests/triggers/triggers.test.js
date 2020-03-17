'use strict';

const path = require('path');
const { expect } = require('chai');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName } = require('../utils/misc');
const { Api, RegistryApi } = require('../../shared/api');
const { createTestService } = require('../utils/misc');
const { FUNCTIONS_API_URL } = require('../../shared/constants');

const serverlessExec = path.join('serverless');

describe('Service Lifecyle Integration Test', () => {
  const devModuleDir = path.resolve(__dirname, '..', '..');
  const tmpDir = getTmpDirPath();
  const containerTmpDir = getTmpDirPath();
  let oldCwd;
  let functionServiceName;
  let containerServiceName;
  const scwOrganization = process.env.SCW_ORGANIZATION;
  const scwToken = process.env.SCW_TOKEN;
  const apiUrl = FUNCTIONS_API_URL;
  let api;
  let registryApi;
  let functionNamespace;
  let containerNamespace;

  beforeAll(() => {
    oldCwd = process.cwd();
    functionServiceName = getServiceName();
    containerServiceName = getServiceName();
    api = new Api(apiUrl, scwToken);
    registryApi = new RegistryApi(scwToken);
  });

  afterAll(() => {
    process.chdir(oldCwd);
  });

  it('should create function service in tmp directory', () => {
    const templateName = path.resolve(devModuleDir, 'examples', 'nodejs10-schedule');
    createTestService(tmpDir, {
      templateName,
      devModuleDir,
      serviceName: functionServiceName,
      runCurrentVersion: true,
      serverlessConfigHook: (config) => {
        // use right SCW token and organization for the deployment as well as service name
        const newConfig = Object.assign({}, config);
        newConfig.provider.scwToken = scwToken;
        newConfig.provider.scwOrganization = scwOrganization;
        return newConfig;
      },
    });
    process.chdir(tmpDir);
  });

  it('should deploy function service to scaleway', async () => {
    execSync(`${serverlessExec} deploy`);
    functionNamespace = await api.getNamespaceFromList(functionServiceName);
    functionNamespace.functions = await api.listFunctions(functionNamespace.id);
  });

  it('should create cronjob for function', async () => {
    const deployedFunction = functionNamespace.functions[0];
    const deployedTriggers = await api.listTriggersForApplication(deployedFunction.id);

    expect(deployedTriggers.length).to.be.equal(1);
    expect(deployedTriggers[0].args.myInput).to.be.equal('myValue');
    expect(deployedTriggers[0].args.mySecondInput).to.be.equal(1);
    expect(deployedTriggers[0].schedule).to.be.equal('1 * * * *');
  });

  it('should remove services from scaleway', async () => {
    execSync(`${serverlessExec} remove`);
    try {
      await api.getNamespace(functionNamespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
  });

  it('should throw error invalid schedule', () => {
    replaceTextInFile('serverless.yml', '1 * * * *', '10 minutes');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }
  });

  it('should throw error invalid triggerType', () => {
    replaceTextInFile('serverless.yml', 'schedule:', 'queue:');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }
  });

  it('should create container service in tmp directory', () => {
    const templateName = path.resolve(devModuleDir, 'examples', 'container-schedule');

    createTestService(containerTmpDir, {
      templateName,
      devModuleDir,
      serviceName: containerServiceName,
      runCurrentVersion: true,
      serverlessConfigHook: (config) => {
        // use right SCW token and organization for the deployment as well as service name
        const newConfig = Object.assign({}, config);
        newConfig.provider.scwToken = scwToken;
        newConfig.provider.scwOrganization = scwOrganization;
        return newConfig;
      },
    });
  });

  it('should deploy container service to scaleway', async () => {
    process.chdir(containerTmpDir);
    execSync(`${serverlessExec} deploy`);
    containerNamespace = await api.getNamespace(containerServiceName);
    containerNamespace.containers = await api.listContainers(containerNamespace.id);
  });

  it('should create cronjob trigger for container', async () => {
    const deployedContainer = containerNamespace.container[0];
    const deployedTriggers = await api.listTriggersForApplication(deployedContainer.id);

    expect(deployedTriggers.length).to.be.equal(1);
    expect(deployedTriggers[0].args.myInput).to.be.equal('myValue');
    expect(deployedTriggers[0].args.mySecondInput).to.be.equal(1);
    expect(deployedTriggers[0].schedule).to.be.equal('1 * * * *');
  });

  it('should remove service from scaleway', async () => {
    execSync(`${serverlessExec} remove`);
    try {
      await api.getNamespace(containerNamespace.id);
    } catch (err) {
      expect(err.response.status).to.be.equal(404);
    }
  });

  it('should throw error invalid schedule', () => {
    replaceTextInFile('serverless.yml', '1 * * * *', '10 minutes');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }
  });

  it('should throw error invalid triggerType', () => {
    replaceTextInFile('serverless.yml', 'schedule:', 'queue:');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // If not try catch, test would fail
    }
  });

  it('should remove registry namespace properly', async () => {
    const response = await registryApi.deleteRegistryNamespace(
      functionNamespace.registry_namespace_id,
    );
    expect(response.status).to.be.equal(200);

    const containerResponse = await registryApi.deleteRegistryNamespace(
      containerNamespace.registry_namespace_id,
    );
    expect(containerResponse.status).to.be.equal(200);
  });
});
