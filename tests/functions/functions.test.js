'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { expect: jestExpect } = require('@jest/globals');
const { execSync } = require('../utils/child-process');
const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep } = require('../utils/misc');
const { FunctionApi, RegistryApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');
const { validateRuntime } = require('../../deploy/lib/createFunctions');

const serverlessExec = path.join('serverless');

describe('Service Lifecyle Integration Test', () => {
  const templateName = path.resolve(__dirname, '..', '..', 'examples', 'nodejs');
  const tmpDir = getTmpDirPath();
  let oldCwd;
  let serviceName;
  const scwRegion = 'fr-par';
  const scwProject = process.env.SCW_DEFAULT_PROJECT_ID || process.env.SCW_PROJECT;
  const scwToken = process.env.SCW_SECRET_KEY || process.env.SCW_TOKEN;
  const apiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
  const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
  let api;
  let registryApi;
  let namespace;

  beforeAll(() => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new FunctionApi(apiUrl, scwToken);
    registryApi = new RegistryApi(registryApiUrl, scwToken);
  });

  afterAll(() => {
    process.chdir(oldCwd);
  });

  it('should create service in tmp directory', () => {
    execSync(`${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`);
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile('serverless.yml', 'scaleway-nodeXX', serviceName);
    replaceTextInFile('serverless.yml', '<scw-token>', scwToken);
    replaceTextInFile('serverless.yml', '<scw-project-id>', scwProject);
    replaceTextInFile('serverless.yml', '<scw-region>', scwRegion);
    expect(fs.existsSync(path.join(tmpDir, 'serverless.yml'))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to scaleway', async () => {
    execSync(`${serverlessExec} deploy`);
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.functions = await api.listFunctions(namespace.id);
  });

  it('should invoke function from scaleway', async () => {
    await sleep(30000);
    const deployedFunction = namespace.functions[0];
    const response = await axios.get(`https://${deployedFunction.domain_name}`);
    expect(response.data.message).to.be.equal('Hello from Serverless Framework and Scaleway Functions :D');
  });

  it('should deploy updated service to scaleway', () => {
    const newHandler = `
        'use strict';

        module.exports.handle = (event, context, cb) => {
          return {
            body: { message: 'Serverless Update Succeeded' }
          };
        }
      `;

    fs.writeFileSync(path.join(tmpDir, 'handler.js'), newHandler);
    execSync(`${serverlessExec} deploy`);
  });

  it('should invoke updated function from scaleway', async () => {
    await sleep(30000);
    const deployedFunction = namespace.functions[0];
    const response = await axios.get(`https://${deployedFunction.domain_name}`);
    expect(response.data.body.message).to.be.equal('Serverless Update Succeeded');
  });

  it('should deploy function with another available runtime', async () => {
    // example: python3
    replaceTextInFile('serverless.yml', 'node16', 'python3');
    const pythonHandler = `
def handle(event, context):
  """handle a request to the function
  Args:
      event (dict): request params
      context (dict): function call metadata
  """

  return {
      "message": "Hello From Python3 runtime on Serverless Framework and Scaleway Functions"
  }
    `;
    fs.writeFileSync(path.join(tmpDir, 'handler.py'), pythonHandler);
    execSync(`${serverlessExec} deploy`);
  });

  it('should invoke updated function from scaleway', async () => {
    await sleep(30000);
    const deployedFunction = namespace.functions[0];
    const response = await axios.get(`https://${deployedFunction.domain_name}`);
    expect(response.data.body.message).to.be.equal('Hello From Python3 runtime on Serverless Framework and Scaleway Functions');
  });

  it('should remove service from scaleway', async () => {
    execSync(`${serverlessExec} remove`);
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

  it('should throw error handler not found', () => {
    replaceTextInFile('serverless.yml', 'handler.handle', 'doesnotexist.handle');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
    replaceTextInFile('serverless.yml', 'doesnotexist.handle', 'handler.handle');
  });

  it('should throw error runtime does not exist', () => {
    replaceTextInFile('serverless.yml', 'node16', 'doesnotexist');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });
});

describe('validateRuntimes', () => {
  beforeEach(() => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleSpy.mockClear();
  });

  it('should throw an error if runtime does not exist', () => {
    const func = { runtime: 'bash4' };
    const existingRuntimes = [
      { name: 'node17', language: 'Node' },
      { name: 'go118', language: 'Go' },
    ];
    const actual = () => validateRuntime(func, existingRuntimes);
    expect(actual).to.throw(Error);
    expect(actual).to.throw('Runtime "bash4" does not exist, must be one of: node17, go118');
    jestExpect(console.log).toHaveBeenCalledTimes(0);
  });

  it('should throw an error if no runtime exists', () => {
    const func = { runtime: 'node17' };
    const existingRuntimes = [];
    const actual = () => validateRuntime(func, existingRuntimes);
    expect(actual).to.throw(Error);
    expect(actual).to.throw('Runtime "node17" does not exist: cannot list runtimes');
    jestExpect(console.log).toHaveBeenCalledTimes(0);
  });

  it('should work if runtime is available', () => {
    const func = { runtime: 'node17' };
    const existingRuntimes = [
      { name: 'node17', language: 'Node', status: 'available' },
      { name: 'go118', language: 'Go', status: 'available' },
    ];
    const actual = validateRuntime(func, existingRuntimes);
    const expected = 'node17';
    expect(actual).to.equal(expected);
    jestExpect(console.log).toHaveBeenCalledTimes(0);
  });

  it('should work and print a message if runtime is not available and no status message', () => {
    const func = { runtime: 'bash4' };
    const existingRuntimes = [
      { name: 'node17', language: 'Node', status: 'available' },
      { name: 'go118', language: 'Go', status: 'available' },
      { name: 'bash4', language: 'Bash', status: 'beta' },
    ];

    const actual = validateRuntime(func, existingRuntimes, console);
    const expected = 'bash4';
    expect(actual).to.equal(expected);
    jestExpect(console.log).toHaveBeenCalledTimes(1);
    jestExpect(console.log).toHaveBeenLastCalledWith('WARNING: Runtime bash4 is in status beta');
  });

  it('should work and print a message if runtime is not available and there is a status message', () => {
    const func = { runtime: 'bash4' };
    const existingRuntimes = [
      { name: 'node17', language: 'Node', status: 'available' },
      { name: 'go118', language: 'Go', status: 'available' },
      {
        name: 'bash4', language: 'Bash', status: 'beta', status_message: 'use with caution',
      },
    ];

    const actual = validateRuntime(func, existingRuntimes, console);
    const expected = 'bash4';
    expect(actual).to.equal(expected);
    jestExpect(console.log).toHaveBeenCalledTimes(1);
    jestExpect(console.log).toHaveBeenLastCalledWith(
      'WARNING: Runtime bash4 is in status beta: use with caution',
    );
  });
});
