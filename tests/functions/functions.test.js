"use strict";

const path = require("path");
const fs = require("fs");

const {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect: jestExpect,
  it,
} = require("@jest/globals");

const { getTmpDirPath, replaceTextInFile } = require("../utils/fs");
const {
  getServiceName,
  sleep,
  serverlessDeploy,
  serverlessInvoke,
  serverlessRemove,
  createProject,
} = require("../utils/misc");
const { FunctionApi } = require("../../shared/api");
const { execSync } = require("../../shared/child-process");
const { validateRuntime } = require("../../deploy/lib/createFunctions");
const { FUNCTIONS_API_URL } = require("../../shared/constants");
const { removeProjectById } = require("../utils/clean-up");

const serverlessExec = path.join("serverless");

// Used to help replace strings in serverless.yml.
const stringIdentifier = "# second-function-identifier";
const serverlessFile = "serverless.yml";
const descriptionTest = "slsfw test description";
const redirectedHttpOptionTest = "redirected";
const enabledHttpOptionTest = "enabled";

describe("Service Lifecyle Integration Test", () => {
  const scwRegion = process.env.SCW_REGION;
  const scwToken = process.env.SCW_SECRET_KEY;
  const apiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
  const templateName = path.resolve(
    __dirname,
    "..",
    "..",
    "examples",
    "nodejs"
  );
  const tmpDir = getTmpDirPath();

  let options = {};
  options.env = {};
  options.env.SCW_SECRET_KEY = scwToken;
  options.env.SCW_REGION = scwRegion;

  let oldCwd;
  let serviceName;
  let projectId;
  let api;
  let namespace;
  let functionName;

  beforeAll(async () => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new FunctionApi(apiUrl, scwToken);
    await createProject()
      .then((project) => {
        projectId = project.id;
      })
      .catch((err) => console.error(err));
    options.env.SCW_DEFAULT_PROJECT_ID = projectId;
  });

  afterAll(async () => {
    await removeProjectById(projectId).catch();
  });

  it("should create service in tmp directory", () => {
    execSync(
      `${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`
    );
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile(serverlessFile, "scaleway-nodeXX", serviceName);
    replaceTextInFile(serverlessFile, "<scw-token>", scwToken);
    replaceTextInFile(serverlessFile, "<scw-project-id>", projectId);
    replaceTextInFile(
      "serverless.yml",
      '# description: ""',
      `description: "${descriptionTest}"`
    );
    jestExpect(fs.existsSync(path.join(tmpDir, serverlessFile))).toBe(true);
    jestExpect(fs.existsSync(path.join(tmpDir, "handler.js"))).toBe(true);
  });

  it("should deploy service to scaleway", async () => {
    serverlessDeploy(options);
    namespace = await api
      .getNamespaceFromList(serviceName, projectId)
      .catch((err) => console.error(err));
    namespace.functions = await api
      .listFunctions(namespace.id)
      .catch((err) => console.error(err));
    jestExpect(namespace.functions[0].description).toEqual(descriptionTest);
    jestExpect(namespace.functions[0].http_option).toEqual(
      redirectedHttpOptionTest
    );
    functionName = namespace.functions[0].name;
  });

  it("should invoke function from scaleway", async () => {
    await api
      .waitFunctionsAreDeployed(namespace.id)
      .catch((err) => console.error(err));
    options.serviceName = functionName;
    const output = serverlessInvoke(options).toString();
    jestExpect(output).toBe(
      '{"message":"Hello from Serverless Framework and Scaleway Functions :D"}'
    );
  });

  it("should deploy updated service to scaleway", () => {
    const newJsHandler = `
'use strict';

module.exports.handle = (event, context, cb) => {
  return {
    message: 'Serverless Update Succeeded',
  };
};
`;

    fs.writeFileSync(path.join(tmpDir, "handler.js"), newJsHandler);
    serverlessDeploy(options);
  });

  it("should create and deploy second function", async () => {
    // add second function with stringIdentifier to remove it easier on next steps.
    const appendData = `  second: ${stringIdentifier}
    handler: handler.handle ${stringIdentifier}`;

    // add a 'second' function to serverless.yml
    fs.appendFileSync(`${tmpDir}/${serverlessFile}`, appendData);

    serverlessDeploy(options);
    namespace = await api
      .getNamespaceFromList(serviceName, projectId)
      .catch((err) => console.error(err));
    namespace.functions = await api
      .listFunctions(namespace.id)
      .catch((err) => console.error(err));
    jestExpect(namespace.functions.length).toEqual(2);
    jestExpect(namespace.functions[0].http_option).toEqual(
      redirectedHttpOptionTest
    );
    jestExpect(namespace.functions[1].http_option).toEqual(
      enabledHttpOptionTest
    );
  });

  it("should invoke first and second function", async () => {
    options.serviceName = namespace.functions[0].name;
    const outputInvoke = serverlessInvoke(options).toString();
    jestExpect(outputInvoke).toEqual(
      '{"message":"Serverless Update Succeeded"}'
    );

    options.serviceName = namespace.functions[1].name;
    const outputInvokeSecond = serverlessInvoke(options).toString();
    jestExpect(outputInvokeSecond).toEqual(
      '{"message":"Serverless Update Succeeded"}'
    );
  });

  it("should remove function second as singleSource is at true", async () => {
    await sleep(30000);

    replaceTextInFile(
      serverlessFile,
      "singleSource: false",
      "singleSource: true"
    );
    replaceTextInFile(serverlessFile, `  second: ${stringIdentifier}`, "");
    replaceTextInFile(
      serverlessFile,
      `    handler: handler.handle ${stringIdentifier}`,
      ""
    );

    // redeploy, func 2 should be removed
    serverlessDeploy(options);
    namespace = await api
      .getNamespaceFromList(serviceName, projectId)
      .catch((err) => console.error(err));
    namespace.functions = await api
      .listFunctions(namespace.id)
      .catch((err) => console.error(err));
    jestExpect(namespace.functions.length).toEqual(1);

    options.serviceName = namespace.functions[0].name;
    const outputInvoke = serverlessInvoke(options).toString();
    jestExpect(outputInvoke).toEqual(
      '{"message":"Serverless Update Succeeded"}'
    );

    options.serviceName = "second";
    try {
      await jestExpect(serverlessInvoke(options)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });

  it("should deploy function with https redirection disabled", async () => {
    replaceTextInFile(
      serverlessFile,
      redirectedHttpOptionTest,
      enabledHttpOptionTest
    );

    // redeploy
    serverlessDeploy(options);
    namespace = await api
      .getNamespaceFromList(serviceName, projectId)
      .catch((err) => console.error(err));
    namespace.functions = await api
      .listFunctions(namespace.id)
      .catch((err) => console.error(err));
    jestExpect(namespace.functions[0].http_option).toEqual(
      enabledHttpOptionTest
    );
    functionName = namespace.functions[0].name;
  });

  it("should invoke updated function from scaleway", async () => {
    await sleep(30000);

    options.serviceName = functionName;
    const output = serverlessInvoke(options).toString();
    jestExpect(output).toEqual('{"message":"Serverless Update Succeeded"}');
  });

  it("should deploy function with another available runtime", async () => {
    // example: python310
    replaceTextInFile(serverlessFile, "node16", "python310");
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
    fs.writeFileSync(path.join(tmpDir, "handler.py"), pythonHandler);
    serverlessDeploy(options);
  });

  it("should invoke function with runtime updated from scaleway", async () => {
    await sleep(30000);

    options.serviceName = functionName;
    const output = serverlessInvoke(options).toString();
    jestExpect(output).toEqual(
      '{"message":"Hello From Python310 runtime on Serverless Framework and Scaleway Functions"}'
    );
  });

  it("should remove service from scaleway", async () => {
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      jestExpect(err.response.status).toEqual(404);
    }
  });

  it("should throw error handler not found", () => {
    replaceTextInFile(serverlessFile, "handler.handle", "doesnotexist.handle");
    try {
      jestExpect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
    replaceTextInFile(serverlessFile, "doesnotexist.handle", "handler.handle");
  });

  it("should throw error runtime does not exist", () => {
    replaceTextInFile(serverlessFile, "python310", "doesnotexist");
    try {
      jestExpect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
    replaceTextInFile(serverlessFile, "doesnotexist", "node16");
  });

  // TODO: throw error if http_option is incorrect
  // ATM, no error is thrown: http_option is not checked during validation
  /*it('should throw error unknown value on field http_option', () => {
    replaceTextInFile(serverlessFile, enabledHttpOptionTest, 'random');
    try {
      expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });*/
});

describe("validateRuntimes", () => {
  beforeEach(() => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    consoleSpy.mockClear();
  });

  it("should throw an error if runtime does not exist", () => {
    const func = { runtime: "bash4" };
    const existingRuntimes = [
      { name: "node17", language: "Node" },
      { name: "go118", language: "Go" },
    ];
    const actual = () => validateRuntime(func, existingRuntimes);
    jestExpect(actual).toThrow(Error);
    jestExpect(actual).toThrow(
      'Runtime "bash4" does not exist, must be one of: node17, go118'
    );
    jestExpect(console.log).toHaveBeenCalledTimes(0);
  });

  it("should throw an error if no runtime exists", () => {
    const func = { runtime: "node17" };
    const existingRuntimes = [];
    const actual = () => validateRuntime(func, existingRuntimes);
    jestExpect(actual).toThrow(Error);
    jestExpect(actual).toThrow(
      'Runtime "node17" does not exist: cannot list runtimes'
    );
    jestExpect(console.log).toHaveBeenCalledTimes(0);
  });

  it("should work if runtime is available", () => {
    const func = { runtime: "node17" };
    const existingRuntimes = [
      { name: "node17", language: "Node", status: "available" },
      { name: "go118", language: "Go", status: "available" },
    ];
    const actual = validateRuntime(func, existingRuntimes);
    const expected = "node17";
    jestExpect(actual).toEqual(expected);
    jestExpect(console.log).toHaveBeenCalledTimes(0);
  });

  it("should work and print a message if runtime is not available and no status message", () => {
    const func = { runtime: "bash4" };
    const existingRuntimes = [
      { name: "node17", language: "Node", status: "available" },
      { name: "go118", language: "Go", status: "available" },
      { name: "bash4", language: "Bash", status: "beta" },
    ];

    const actual = validateRuntime(func, existingRuntimes, console);
    const expected = "bash4";
    jestExpect(actual).toEqual(expected);
    jestExpect(console.log).toHaveBeenCalledTimes(1);
    jestExpect(console.log).toHaveBeenLastCalledWith(
      "WARNING: Runtime bash4 is in status beta"
    );
  });

  it("should work and print a message if runtime is not available and there is a status message", () => {
    const func = { runtime: "bash4" };
    const existingRuntimes = [
      { name: "node17", language: "Node", status: "available" },
      { name: "go118", language: "Go", status: "available" },
      {
        name: "bash4",
        language: "Bash",
        status: "beta",
        status_message: "use with caution",
      },
    ];

    const actual = validateRuntime(func, existingRuntimes, console);
    const expected = "bash4";
    jestExpect(actual).toEqual(expected);
    jestExpect(console.log).toHaveBeenCalledTimes(1);
    jestExpect(console.log).toHaveBeenLastCalledWith(
      "WARNING: Runtime bash4 is in status beta: use with caution"
    );
  });
});
