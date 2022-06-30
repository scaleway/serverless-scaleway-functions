'use strict';

const path = require('path');

const { execSync } = require('../../../shared/child-process');
const { readYamlFile, writeYamlFile } = require('../fs');

const logger = console;

const testServiceIdentifier = 'scwtestsls';

const serverlessExec = 'serverless';

function getServiceName(identifier = '') {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${identifier}${hrtime[1]}`;
}

function deployService() {
  execSync(`${serverlessExec} deploy`);
}

function removeService() {
  execSync(`${serverlessExec} remove`);
}

function replaceEnv(values) {
  const originals = {};
  Object.keys(values).forEach((key) => {
    if (process.env[key]) {
      originals[key] = process.env[key];
    } else {
      originals[key] = 'undefined';
    }
    if (values[key] === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  });
  return originals;
}

function createTestService(
  tmpDir,
  repoDir,
  options = {
    devModuleDir: '',
    templateName: 'nodejs10', // Name of the template inside example directory to use for test service
    serviceName: null,
    serverlessConfigHook: null, // Eventual hook that allows to customize serverless config
    runCurrentVersion: false,
  },
) {
  const serviceName = options.serviceName || getServiceName();

  if (!options.templateName) {
    throw new Error('Template Name must be provided to create a test service');
  }

  // create a new Serverless service
  execSync(`${serverlessExec} create --template-path ${options.templateName} --path ${tmpDir}`);
  process.chdir(tmpDir);

  // Install our local version of this repo
  // If this is not the first time this has been run, or the repo is already linked for development, this requires --force
  execSync(`npm link --force ${repoDir}`);

  const serverlessFilePath = path.join(tmpDir, 'serverless.yml');
  let serverlessConfig = readYamlFile(serverlessFilePath);
  // Ensure unique service name
  serverlessConfig.service = serviceName;
  if (options.serverlessConfigHook) {
    serverlessConfig = options.serverlessConfigHook(serverlessConfig);
  }
  writeYamlFile(serverlessFilePath, serverlessConfig);

  return serverlessConfig;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  logger,
  testServiceIdentifier,
  serverlessExec,
  getServiceName,
  deployService,
  removeService,
  replaceEnv,
  createTestService,
  sleep,
};
