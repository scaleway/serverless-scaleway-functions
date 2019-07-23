'use strict';

const path = require('path');
const fse = require('fs-extra');
const { execSync } = require('../child-process');
const { readYamlFile, writeYamlFile } = require('../fs');

const logger = console;

const region = 'us-east-1';

const testServiceIdentifier = 'scwtestsls';

const serverlessExec = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.bin', 'serverless');

const serviceNameRegex = new RegExp(`${testServiceIdentifier}-d+`);

function getServiceName() {
  const hrtime = process.hrtime();
  return `${testServiceIdentifier}-${hrtime[1]}`;
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
  options = {
    // Either templateName or templateDir have to be provided
    templateName: null, // Generic template to use (e.g. 'aws-nodejs')
    templateDir: null, // Path to custom pre-prepared service template
    filesToAdd: [], // Array of additional files to add to the service directory
    serverlessConfigHook: null, // Eventual hook that allows to customize serverless config
  },
) {
  const serviceName = getServiceName();

  fse.mkdirsSync(tmpDir);
  process.chdir(tmpDir);

  if (options.templateName) {
    // create a new Serverless service
    execSync(`${serverlessExec} create --template-path ${options.templateName}`);
  } else if (options.templateDir) {
    fse.copySync(options.templateDir, tmpDir, { clobber: true, preserveTimestamps: true });
  } else {
    throw new Error("Either 'templateName' or 'templateDir' options have to be provided");
  }

  if (options.filesToAdd && options.filesToAdd.length) {
    options.filesToAdd.forEach((filePath) => {
      fse.copySync(filePath, tmpDir, { preserveTimestamps: true });
    });
  }

  const serverlessFilePath = path.join(tmpDir, 'serverless.yml');
  let serverlessConfig = readYamlFile(serverlessFilePath);
  // Ensure unique service name
  serverlessConfig.service = serviceName;
  if (options.serverlessConfigHook) {
    serverlessConfig = options.serverlessConfigHook(serverlessConfig);
  }
  writeYamlFile(serverlessFilePath, serverlessConfig);

  process.env.TOPIC_1 = `${serviceName}-1`;
  process.env.TOPIC_2 = `${serviceName}-1`;
  process.env.BUCKET_1 = `${serviceName}-1`;
  process.env.BUCKET_2 = `${serviceName}-2`;
  process.env.COGNITO_USER_POOL_1 = `${serviceName}-1`;
  process.env.COGNITO_USER_POOL_2 = `${serviceName}-2`;

  return serverlessConfig;
}

module.exports = {
  logger,
  region,
  testServiceIdentifier,
  serverlessExec,
  serviceNameRegex,
  getServiceName,
  deployService,
  removeService,
  replaceEnv,
  createTestService,
};
