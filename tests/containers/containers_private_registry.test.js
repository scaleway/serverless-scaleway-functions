"use strict";

const crypto = require("crypto");
const Docker = require("dockerode");
const fs = require("fs");
const path = require("path");

const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");

const { getTmpDirPath, replaceTextInFile } = require("../utils/fs");
const {
  getServiceName,
  serverlessDeploy,
  serverlessRemove,
  serverlessInvoke,
  createProject,
} = require("../utils/misc");
const { ContainerApi, RegistryApi } = require("../../shared/api");
const { execSync } = require("../../shared/child-process");
const {
  CONTAINERS_API_URL,
  REGISTRY_API_URL,
} = require("../../shared/constants");
const { removeProjectById } = require("../utils/clean-up");

const serverlessExec = path.join("serverless");

describe("Build and deploy on container with a base image private", () => {
  const scwRegion = process.env.SCW_REGION;
  const scwToken = process.env.SCW_SECRET_KEY;
  const apiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
  const registryApiUrl = `${REGISTRY_API_URL}/${scwRegion}/`;
  const templateName = path.resolve(
    __dirname,
    "..",
    "..",
    "examples",
    "container"
  );
  const tmpDir = getTmpDirPath();

  let options = {};
  options.env = {};
  options.env.SCW_SECRET_KEY = scwToken;
  options.env.SCW_REGION = scwRegion;

  let oldCwd,
    serviceName,
    projectId,
    api,
    namespace,
    containerName,
    registryApi;

  const originalImageRepo = "python";
  const imageTag = "3-alpine";
  let privateRegistryImageRepo;
  let privateRegistryNamespaceId;

  beforeAll(async () => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new ContainerApi(apiUrl, scwToken);
    registryApi = new RegistryApi(registryApiUrl, scwToken);

    await createProject().then((project) => {
      projectId = project.id;
    });
    options.env.SCW_DEFAULT_PROJECT_ID = projectId;

    // pull the base image, create a private registry, push it into that registry, and remove the image locally
    // to check that the image is pulled at build time
    const registryName = `private-registry-${crypto
      .randomBytes(16)
      .toString("hex")}`;
    const privateRegistryNamespace = await registryApi.createRegistryNamespace({
      name: registryName,
      project_id: projectId,
    });
    privateRegistryNamespaceId = privateRegistryNamespace.id;

    privateRegistryImageRepo = `rg.${scwRegion}.scw.cloud/${registryName}/python`;

    const docker = new Docker();
    const pullStream = await docker
      .pull(`${originalImageRepo}:${imageTag}`)
      .then();

    // Wait for pull to finish
    await new Promise((res) => docker.modem.followProgress(pullStream, res));
    const originalImage = docker.getImage(`${originalImageRepo}:${imageTag}`);
    await originalImage.tag({ repo: privateRegistryImageRepo, tag: imageTag });

    const privateRegistryImage = docker.getImage(
      `${privateRegistryImageRepo}:${imageTag}`
    );

    const auth = {
      username: "nologin",
      password: scwToken,
    };

    await new Promise((resolve, reject) => {
      privateRegistryImage.push({ authconfig: auth }, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, res) =>
          err ? reject(err) : resolve(res)
        );
      });
    });

    await privateRegistryImage.remove();
  });

  afterAll(async () => {
    await removeProjectById(projectId).catch();
  });

  it("should create service in tmp directory", async () => {
    execSync(
      `${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`
    );
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile("serverless.yml", "scaleway-container", serviceName);
    replaceTextInFile(
      path.join("my-container", "Dockerfile"),
      "FROM python:3-alpine",
      `FROM ${privateRegistryImageRepo}:${imageTag}`
    );
    expect(fs.existsSync(path.join(tmpDir, "serverless.yml"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "my-container"))).toBe(true);
  });

  it("should deploy service/container to scaleway", async () => {
    serverlessDeploy(options);
    namespace = await api.getNamespaceFromList(serviceName, projectId);
    namespace.containers = await api.listContainers(namespace.id);
    containerName = namespace.containers[0].name;
  });

  it("should invoke container from scaleway", async () => {
    await api.waitContainersAreDeployed(namespace.id);
    options.serviceName = containerName;
    const output = serverlessInvoke(options).toString();
    expect(output).toBe('{"message":"Hello, World from Scaleway Container !"}');
  });

  it("should remove service from scaleway", async () => {
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).toBe(404);
    }
  });
});
