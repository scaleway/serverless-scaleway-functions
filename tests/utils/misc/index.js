'use strict';

const path = require('path');

const { execSync } = require('../../../shared/child-process');
const { readYamlFile, writeYamlFile } = require('../fs');

const logger = console;

const testServiceIdentifier = 'scwtestsls';

const serverlessExec = 'serverless';

const project = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
const secretKey = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
const region = process.env.SCW_REGION;

function getServiceName(identifier = '') {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${identifier}${hrtime[1]}`;
}

function mergeOptionsWithEnv(options) {
  if (!options) {
    options = {};
  }
  if (!options.env) {
    options.env = {};
  }

  options.env.PATH = process.env.PATH;

  if (!options.env.SCW_DEFAULT_PROJECT_ID) {
    options.env.SCW_DEFAULT_PROJECT_ID = project;
  }
  if (!options.env.SCW_SECRET_KEY) {
    options.env.SCW_SECRET_KEY = secretKey;
  }
  if (!options.env.SCW_REGION) {
    options.env.SCW_REGION = region;
  }

  return options;
}

function serverlessDeploy(options) {
  options = mergeOptionsWithEnv(options);
  return execSync(`${serverlessExec} deploy`, options);
}

function serverlessRemove(options) {
  options = mergeOptionsWithEnv(options);
  return execSync(`${serverlessExec} remove`, options);
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
  serverlessDeploy,
  serverlessRemove,
  createTestService,
  sleep,
};
