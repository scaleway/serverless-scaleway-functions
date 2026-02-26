"use strict";

const Docker = require("dockerode");
const fs = require("fs");
const path = require("path");

const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");

const { getTmpDirPath, replaceTextInFile } = require("../utils/fs");
const {
  getServiceName,
  sleep,
  serverlessDeploy,
  serverlessInvoke,
  serverlessRemove,
  createProject,
} = require("../utils/misc");
const { ContainerApi } = require("../../shared/api");
const { execSync } = require("../../shared/child-process");
const { CONTAINERS_API_URL } = require("../../shared/constants");
const { removeProjectById } = require("../utils/clean-up");

const serverlessExec = path.join("serverless");

describe("Service Lifecyle Integration Test", () => {
  const scwRegion = process.env.SCW_REGION;
  const scwToken = process.env.SCW_SECRET_KEY;
  const apiUrl = `${CONTAINERS_API_URL}/${scwRegion}`;
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

  let oldCwd, serviceName, projectId, api, namespace, containerName;
  const descriptionTest = "slsfw test description";

  beforeAll(async () => {
    oldCwd = process.cwd();
    serviceName = getServiceName();
    api = new ContainerApi(apiUrl, scwToken);
    await createProject()
      .then((project) => {
        projectId = project.id;
      })
      .catch((err) => console.error(err));
    options.env.SCW_DEFAULT_PROJECT_ID = projectId;
  });

  afterAll(async () => {
    await removeProjectById(projectId).catch((err) => console.error(err));
  });

  it("should create service in tmp directory", () => {
    execSync(
      `${serverlessExec} create --template-path ${templateName} --path ${tmpDir}`
    );
    process.chdir(tmpDir);
    execSync(`npm link ${oldCwd}`);
    replaceTextInFile("serverless.yml", "scaleway-container", serviceName);
    replaceTextInFile(
      "serverless.yml",
      '# description: ""',
      `description: "${descriptionTest}"`
    );
    expect(fs.existsSync(path.join(tmpDir, "serverless.yml"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "my-container"))).toBe(true);
  });

  it("should deploy service/container to scaleway", async () => {
    serverlessDeploy(options);
    namespace = await api
      .getNamespaceFromList(serviceName, projectId)
      .catch((err) => console.error(err));
    namespace.containers = await api
      .listContainers(namespace.id)
      .catch((err) => console.error(err));
    expect(namespace.containers[0].description).toBe(descriptionTest);
    containerName = namespace.containers[0].name;
  });

  it("should replace container image with test image", async () => {
    // This tests will push a dummy image to the same namespace of the deployed
    // container. And then it will modify the image through the API.
    // After that we run a serverless deploy to ensure the container image
    // is NOT the dummy image.

    // build a new image with same path but different name for testing.
    const regImg = namespace.containers[0].registry_image;
    const contName = namespace.containers[0].name;
    const imageName = regImg.replace(contName, "test-container");

    const docker = new Docker();

    // used for pushing
    const auth = {
      username: "any",
      password: scwToken,
    };

    // Build image and wait for completion
    await new Promise((resolve, reject) => {
      docker.buildImage(
        {
          context: path.join(tmpDir, "my-container"),
          src: ["Dockerfile", "server.py", "requirements.txt"],
        },
        // Ensure no credentials are sent to Docker Hub.
        { t: imageName, authconfig: {} },
        (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, res) =>
            err ? reject(err) : resolve(res)
          );
        }
      );
    });

    const image = docker.getImage(imageName);

    // Push image and wait for completion
    await new Promise((resolve, reject) => {
      image.push({ authconfig: auth }, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err, res) =>
          err ? reject(err) : resolve(res)
        );
      });
    });

    // registry lag
    await sleep(60000);

    const params = { registry_image: imageName };
    await api
      .updateContainer(namespace.containers[0].id, params)
      .catch((err) => console.error(err));

    const nsContainers = await api
      .listContainers(namespace.id)
      .catch((err) => console.error(err));
    expect(nsContainers[0].registry_image).toBe(imageName);

    serverlessDeploy(options);

    const nsContainersAfterSlsDeploy = await api
      .listContainers(namespace.id)
      .catch((err) => console.error(err));
    expect(nsContainersAfterSlsDeploy[0].registry_image).not.toContain(
      "test-container"
    );
  });

  it("should invoke container from scaleway", async () => {
    await api
      .waitContainersAreDeployed(namespace.id)
      .catch((err) => console.error(err));
    options.serviceName = containerName;
    const output = serverlessInvoke(options).toString();
    expect(output).toBe('{"message":"Hello, World from Scaleway Container !"}');
  });

  it("should deploy updated service/container to scaleway", () => {
    replaceTextInFile(
      "my-container/server.py",
      "Hello, World from Scaleway Container !",
      "Container successfully updated"
    );
    serverlessDeploy(options);
  });

  it("should invoke updated container from scaleway", async () => {
    await api
      .waitContainersAreDeployed(namespace.id)
      .catch((err) => console.error(err));
    const output = serverlessInvoke(options).toString();
    expect(output).toBe('{"message":"Container successfully updated"}');
  });

  it("should deploy with registry image specified", () => {
    // Instead of building the container from the directory, we specify a registry image.
    replaceTextInFile(
      "serverless.yml",
      "directory: my-container",
      "# directory: my-container"
    );
    replaceTextInFile(
      "serverless.yml",
      '# registryImage: ""',
      "registryImage: docker.io/library/nginx:latest"
    );
    replaceTextInFile("serverless.yml", "# port: 8080", "port: 80");
    // Need to change the probe path to / since Nginx doesn't have /health endpoint
    replaceTextInFile("serverless.yml", "httpPath: /health", "httpPath: /");
    serverlessDeploy(options);
  });

  it("should invoke updated container with specified registry image", async () => {
    await sleep(30000);
    options.serviceName = containerName;
    const output = serverlessInvoke(options).toString();
    expect(output).toContain("Welcome to nginx!");
  });

  it("should remove service from scaleway", async () => {
    serverlessRemove(options);
    try {
      await api.getNamespace(namespace.id);
    } catch (err) {
      expect(err.response.status).toBe(404);
    }
  });

  // TODO: handle error at validation time
  // ATM, error is thrown when trying to build the image because the directory is not found,
  // instead, we should check at validation time if the directory exists (if not, we create
  // a namespace resource for nothing, preventing to delete the project afterwards)
  /*it('should throw error container directory not found', () => {
    replaceTextInFile('serverless.yml', 'my-container', 'doesnotexist');
    try {
      expect(serverlessDeploy(options)).rejects.toThrow(Error);
    } catch (err) {
      // if not try catch, test would fail
    }
  });*/
});
