'use strict';

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { expect } = require('chai');
const { expect: jestExpect, it } = require('@jest/globals');

const { getTmpDirPath, replaceTextInFile } = require('../utils/fs');
const { getServiceName, sleep } = require('../utils/misc');
const { FunctionApi, RegistryApi } = require('../../shared/api');
const { FUNCTIONS_API_URL, REGISTRY_API_URL } = require('../../shared/constants');
const { execSync, execCaptureOutput } = require('../../shared/child-process');
const { validateRuntime } = require('../../deploy/lib/createFunctions');

const serverlessExec = path.join('serverless');

// Used to help replace strings in serverless.yml.
const stringIdentifier = '# second-function-identifier';
const serverlessFile = 'serverless.yml';

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
  let functionName;

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
    replaceTextInFile(serverlessFile, 'scaleway-nodeXX', serviceName);
    replaceTextInFile(serverlessFile, '<scw-token>', scwToken);
    replaceTextInFile(serverlessFile, '<scw-project-id>', scwProject);
    replaceTextInFile(serverlessFile, 'scwRegion: fr-par', `scwRegion: ${scwRegion}`);
    expect(fs.existsSync(path.join(tmpDir, serverlessFile))).to.be.equal(true);
    expect(fs.existsSync(path.join(tmpDir, 'handler.js'))).to.be.equal(true);
  });

  it('should deploy service to scaleway', async () => {
    execSync(`${serverlessExec} deploy`);
    namespace = await api.getNamespaceFromList(serviceName);
    namespace.functions = await api.listFunctions(namespace.id);
    functionName = namespace.functions[0].name;
  });

  it('should invoke function from scaleway', async () => {
    // TODO query function status instead of having an arbitrary sleep
    await sleep(30000);

    const output = execCaptureOutput(serverlessExec, ['invoke', '--function', functionName]);
    expect(output).to.be.equal('{"message":"Hello from Serverless Framework and Scaleway Functions :D"}');
  });

  it('should deploy updated service to scaleway', () => {
    const newJsHandler = `
'use strict';

module.exports.handle = (event, context, cb) => {
  return {
    message: 'Serverless Update Succeeded',
  };
};
`;

    fs.writeFileSync(path.join(tmpDir, 'handler.js'), newJsHandler);
    execSync(`${serverlessExec} deploy`);
  });

  it('should create and deploy second function', async () => {
    await sleep(30000);

    const appendData = `
  second: ${stringIdentifier}
    handler: handler.handle ${stringIdentifier}`;

    // add a 'second' function to serverless.yml
    fs.appendFile(`${tmpDir}/${serverlessFile}`, appendData, (err) => {
      expect(err).to.be.equal(null);
    });

    execSync(`${serverlessExec} deploy`);
  });
  it('should invoke first and second function', async () => {
    await sleep(30000);

    const output = execCaptureOutput(serverlessExec, ['invoke', '--function', 'second']);
    expect(output).to.be.equal('{"message":"Hello from Serverless Framework and Scaleway Functions :D"}');

    // now we add singleSource @ true
    const serverlessFileData = fs.readFileSync(`${tmpDir}/${serverlessFile}`).toString().split("\n");
    serverlessFileData.splice(0, 0, 'singleSource: true');

    const text = serverlessFileData.join("\n");

    fs.writeFile(`${tmpDir}/${serverlessFile}`, text, (err) => {
      expect(err).to.be.equal(null);
    });

    namespace = await api.getNamespaceFromList(serviceName);
    namespace.functions = await api.listFunctions(namespace.id);

    const outputInvoke = execCaptureOutput(serverlessExec, ['invoke', '--function', namespace.functions[0].name]);
    expect(outputInvoke).to.be.equal('{"message":"Hello from Serverless Framework and Scaleway Functions :D"}');

    const outputInvokeSecond = execCaptureOutput(serverlessExec, ['invoke', '--function', 'second']);
    expect(outputInvokeSecond).to.be.equal('{"message":"Hello from Serverless Framework and Scaleway Functions :D"}');
  });

  it('should remove function second as singleSource is at', async () => {
    await sleep(30000);

    replaceTextInFile(serverlessFile, 'singleSource: false', 'singleSource: true');
    replaceTextInFile(serverlessFile, `  second: ${stringIdentifier}`, '');
    replaceTextInFile(serverlessFile, `    handler: handler.handle ${stringIdentifier}`, '');

    // redeploy, func 2 should be removed
    execSync(`${serverlessExec} deploy`);
  });

  it('should invoke updated function from scaleway', async () => {
    await sleep(30000);

    const output = execCaptureOutput(serverlessExec, ['invoke', '--function', functionName]);
    expect(output).to.be.equal('{"message":"Serverless Update Succeeded"}');
  });

  it('should deploy function with another available runtime', async () => {
    // example: python310
    replaceTextInFile(serverlessFile, 'node16', 'python310');
    const pythonHandler = `
def handle(event, context):
  """handle a request to the function
  Args:
      event (dict): request params
      context (dict): function call metadata
  """

  return {
      "message": "Hello From Python310 runtime on Serverless Framework and Scaleway Functions"
  }
`;
    fs.writeFileSync(path.join(tmpDir, 'handler.py'), pythonHandler);
    execSync(`${serverlessExec} deploy`);
  });

  it('should invoke function with runtime updated from scaleway', async () => {
    await sleep(30000);

    const output = execCaptureOutput(serverlessExec, ['invoke', '--function', functionName]);
    expect(output).to.be.equal('{"message":"Hello From Python310 runtime on Serverless Framework and Scaleway Functions"}');
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
    replaceTextInFile(serverlessFile, 'handler.handle', 'doesnotexist.handle');
    try {
      expect(execSync(`${serverlessExec} deploy`)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
    replaceTextInFile(serverlessFile, 'doesnotexist.handle', 'handler.handle');
  });

  it('should throw error runtime does not exist', () => {
    replaceTextInFile(serverlessFile, 'node16', 'doesnotexist');
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
