"use strict";

const fs = require("fs");
const path = require("path");

const { execSync } = require("../../shared/child-process");
const { getTmpDirPath, replaceTextInFile } = require("../utils/fs");
const {
  getServiceName,
  serverlessDeploy,
  serverlessRemove,
  serverlessInvokeWithRetry,
  createProject,
  getNamespaceFromListWithRetry,
  isNamespaceRemoved,
} = require("../utils/misc");
const { FunctionApi } = require("../../shared/api");
const { FUNCTIONS_API_URL } = require("../../shared/constants");
const { removeProjectById } = require("../utils/clean-up");

const serverlessExec = path.join("serverless");

const scwToken = process.env.SCW_SECRET_KEY;

const functionTemplateName = path.resolve(
  __dirname,
  "..",
  "..",
  "examples",
  "python3",
);
const oldCwd = process.cwd();
const serviceName = getServiceName();

const regions = ["fr-par", "nl-ams", "pl-waw"];

describe("test regions", () => {
  it.concurrent.each(regions)("region %s", async (region) => {
    let options = {};
    options.env = {};
    options.env.SCW_SECRET_KEY = scwToken;

    let projectId, api, namespace, apiUrl;

    // should create project
    // not in beforeAll because of a known bug between concurrent tests and async beforeAll
    await createProject()
      .then((project) => {
        projectId = project.id;
      })
      .catch((err) => console.error(err));
    options.env.SCW_DEFAULT_PROJECT_ID = projectId;

    // should create working directory
    const tmpDir = getTmpDirPath();
    execSync(
      `${serverlessExec} create --template-path ${functionTemplateName} --path ${tmpDir}`,
    );
    // Deliberately NOT process.chdir(tmpDir) here - it.concurrent.each runs
    // all 3 regions in this same process at once, and process.chdir()
    // mutates global, process-wide state: one region's chdir can silently
    // redirect another region's later relative-path operations into the
    // wrong tmpDir while it's mid-await. Every command below instead gets
    // an explicit cwd/absolute path, which is immune to a sibling region
    // changing the process's cwd out from under it.
    execSync(`npm link ${oldCwd}`, { cwd: tmpDir });
    const serverlessYmlPath = path.join(tmpDir, "serverless.yml");
    // `serverless create --template-path ... --path <tmpDir>` sets `service:`
    // to <tmpDir>'s own basename (confirmed against the live osls 3.77.1
    // CLI), so the placeholder "scaleway-python3" string this used to look
    // for is already gone by this point and a plain text replace silently
    // no-ops. tmpDir's basename is a random hex string (getTmpDirPath()),
    // which is only a valid Scaleway resource name when it happens to start
    // with a-f rather than 0-9 - and even then the deploy would silently use
    // that name instead of `serviceName`, so later lookups by `serviceName`
    // fail. Replace the exact string `create` put there instead of routing
    // through readYamlFile/writeYamlFile - a js-yaml load->dump roundtrip
    // silently drops every comment in the file (confirmed directly), which
    // broke a later replace in containers.test.js's identical pattern - same
    // fix applied here for consistency even though this file has no later
    // replaceTextInFile call on serverless.yml that a stripped comment would
    // currently break.
    replaceTextInFile(
      serverlessYmlPath,
      `service: ${path.basename(tmpDir)}`,
      `service: ${serviceName}`,
    );
    expect(fs.existsSync(serverlessYmlPath)).toEqual(true);
    expect(fs.existsSync(path.join(tmpDir, "handler.py"))).toEqual(true);

    // should deploy service for region ${region}
    apiUrl = `${FUNCTIONS_API_URL}/${region}`;
    api = new FunctionApi(apiUrl, scwToken);
    options.env.SCW_REGION = region;
    options.cwd = tmpDir;
    serverlessDeploy(options);
    namespace = await getNamespaceFromListWithRetry(
      api,
      serviceName,
      projectId,
    );
    namespace.functions = await api.listFunctions(namespace.id);

    // should invoke service for region ${region}
    const deployedFunction = namespace.functions[0];
    expect(deployedFunction.domain_name.split(".")[3]).toEqual(region);
    options.serviceName = deployedFunction.name;
    const output = (await serverlessInvokeWithRetry(options)).toString();
    expect(output).toEqual(
      '"Hello From Python3 runtime on Serverless Framework and Scaleway Functions"',
    );

    // should remove service for region ${region}
    serverlessRemove(options);
    expect(await isNamespaceRemoved(api, namespace.id)).toBe(true);

    // should remove project
    await removeProjectById(projectId).catch((err) => console.error(err));
  });
});
