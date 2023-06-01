"use strict";

const fs = require("fs");
const path = require("path");

const { getTmpDirPath } = require("../utils/fs");
const {
  getServiceName,
  serverlessDeploy,
  serverlessRemove,
  createProject,
  sleep,
  createTestService,
  serverlessInvoke,
} = require("../utils/misc");

const { FunctionApi } = require("../../shared/api");
const { FUNCTIONS_API_URL } = require("../../shared/constants");
const { describe, it, expect } = require("@jest/globals");
const { removeProjectById } = require("../utils/clean-up");

const scwRegion = process.env.SCW_REGION;
const scwToken = process.env.SCW_SECRET_KEY;

const functionApiUrl = `${FUNCTIONS_API_URL}/${scwRegion}`;
const devModuleDir = path.resolve(__dirname, "..", "..");
const examplesDir = path.resolve(devModuleDir, "examples");

const oldCwd = process.cwd();

/* Some examples are already indirectly tested in other tests, so we don't test them again here. For
 * example, container-schedule and nodejs-schedule are tested in triggers, python3 in multi_regions,
 * etc... */
const exampleRepositories = [
  "go",
  "multiple",
  "nodejs-es-modules",
  "php",
  "rust",
  "secrets",
];

describe("test runtimes", () => {
  it.concurrent.each(exampleRepositories)(
    "test runtimes %s",
    async (runtime) => {
      let options = {};
      options.env = {};
      options.env.SCW_SECRET_KEY = scwToken;
      options.env.SCW_REGION = scwRegion;

      let api, projectId;

      // Should create project
      await createProject()
        .then((project) => {
          projectId = project.id;
        })
        .catch((err) => console.error(err));
      options.env.SCW_DEFAULT_PROJECT_ID = projectId;

      // should create service for runtime ${runtime} in tmp directory
      const tmpDir = getTmpDirPath();
      const serviceName = getServiceName(runtime);
      createTestService(tmpDir, oldCwd, {
        devModuleDir,
        templateName: path.resolve(examplesDir, runtime),
        serviceName: serviceName,
        runCurrentVersion: true,
      });

      expect(fs.existsSync(path.join(tmpDir, "serverless.yml"))).toEqual(true);
      expect(fs.existsSync(path.join(tmpDir, "package.json"))).toEqual(true);

      // should deploy service for runtime ${runtime} to scaleway
      let optionsWithSecrets = options;
      if (runtime === "secrets") {
        optionsWithSecrets.env.ENV_SECRETC = "valueC";
        optionsWithSecrets.env.ENV_SECRET3 = "value3";
      }
      serverlessDeploy(optionsWithSecrets);

      api = new FunctionApi(functionApiUrl, scwToken);
      let namespace = await api
        .getNamespaceFromList(serviceName, projectId)
        .catch((err) => console.error(err));
      namespace.functions = await api
        .listFunctions(namespace.id)
        .catch((err) => console.error(err));

      // should invoke function for runtime ${runtime} from scaleway
      const deployedApplication = namespace.functions[0];
      await sleep(30000);
      process.chdir(tmpDir);
      optionsWithSecrets.serviceName = deployedApplication.name;
      const output = serverlessInvoke(optionsWithSecrets).toString();
      expect(output).not.toEqual("");

      if (runtime === "secrets") {
        expect(output).toEqual(
          '{"env_vars":["env_notSecret1","env_notSecretA","env_secret1","env_secret2","env_secret3","env_secretA","env_secretB","env_secretC"]}'
        );
      }

      // should remove service for runtime ${runtime} from scaleway
      process.chdir(tmpDir);
      serverlessRemove(optionsWithSecrets);
      try {
        await api.getNamespace(namespace.id);
      } catch (err) {
        expect(err.response.status).toEqual(404);
      }

      // Should delete project
      await removeProjectById(projectId).catch((err) => console.error(err));
    }
  );
});
