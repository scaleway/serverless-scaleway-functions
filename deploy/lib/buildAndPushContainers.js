"use strict";

const Docker = require("dockerode");
const path = require("path");
const fs = require("fs");

const docker = new Docker();

function extractStreamContents(stream, verbose) {
  return new Promise((resolve, reject) => {
    const streamContent = [];

    stream.on("data", (data) => {
      const streamData = data.toString().replace("\n", "");
      streamContent.push(streamData);

      if (verbose) {
        console.log(streamData);
      }
    });

    stream.on("end", () => {
      resolve(streamContent);
    });
    stream.on("error", reject);
  });
}

function findErrorInBuildOutput(buildOutput) {
  for (const buildStepLog of buildOutput) {
    if (buildStepLog.startsWith('{"errorDetail":{')) {
      let errorDetail;
      try {
        errorDetail = JSON.parse(buildStepLog)["errorDetail"];
      } catch {
        return "";
      }

      if (errorDetail !== undefined && errorDetail["message"] !== undefined) {
        return errorDetail["message"];
      }

      return JSON.stringify(errorDetail);
    }
  }
}

function getFilesInBuildContextDirectory(directory) {
  let files = [];

  try {
    const dirents = fs.readdirSync(directory, { withFileTypes: true });

    dirents.forEach((dirent) => {
      const absolutePath = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        const subFiles = getFilesInBuildContextDirectory(absolutePath);

        // Prepend the current directory name to each subfile path
        const relativeSubFiles = subFiles.map((subFile) =>
          path.join(dirent.name, subFile)
        );
        files = files.concat(relativeSubFiles);
      } else if (dirent.isFile() && dirent.name !== ".dockerignore") {
        // Don't include .dockerignore file in result
        files.push(dirent.name);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${directory}:`, err);
  }

  return files;
}

function validateContainerConfigBeforeBuild(containerConfig) {
  const { name, buildArgs } = containerConfig;

  if (buildArgs !== undefined && typeof buildArgs !== "object") {
    throw new Error(
      `Build arguments for container ${name} should be an object.
          Example:
          containers:
            ${name}:
              directory: my-container-directory
              buildArgs:
                MY_BUILD_ARG: "my-value"
          `
    );
  }
}

async function buildAndPushContainer(authConfig, containerConfig) {
  const { name, directory, buildArgs } = containerConfig;
  const imageName = `${this.namespace.registry_endpoint}/${name}:latest`;

  this.serverless.cli.log(
    `Building and pushing container ${name} to: ${imageName} ...`
  );

  let buildOptions = {
    t: imageName,
    authconfig: auth,
  };

  if (buildArgs !== undefined) {
    buildOptions.buildargs = buildArgs;
  }

  const buildStream = await docker.buildImage(
    {
      context: directory,
      src: getFilesInBuildContextDirectory(directory),
    },
    buildOptions
  );
  const buildStreamEvents = await extractStreamContents(
    buildStream,
    this.provider.options.verbose
  );

  const buildError = findErrorInBuildOutput(buildStreamEvents);
  if (buildError !== undefined) {
    throw new Error(
      `Build did not succeed for container ${name}, error: ${buildError}`
    );
  }

  const image = docker.getImage(imageName);

  const inspectedImage = await image.inspect().catch(() => {
    throw new Error(
      `Image ${imageName} does not exist: run --verbose to see errors`
    );
  });

  if (inspectedImage === undefined) {
    return;
  }

  if (inspectedImage["Architecture"] !== "amd64") {
    throw new Error(
      "It appears that image have been built with " +
        inspectedImage["Architecture"] +
        " architecture. " +
        "To build a compatible image with Scaleway serverless containers, " +
        "the platform of the built image must be `linux/amd64`. " +
        "Please pull your image's base image with platform `linux/amd64`: " +
        "first (`docker pull --platform=linux/amd64 <your_base_image>`), " +
        "and just after, run `serverless deploy`. You shouldn't pull the other " +
        "image architecture between those two steps."
    );
  }

  const pushStream = await image.push({ authconfig: authConfig });
  await extractStreamContents(pushStream, this.provider.options.verbose);
}

module.exports = {
  async buildAndPushContainers() {
    const auth = {
      username: "any",
      password: this.provider.scwToken,
      serveraddress: `rg.${this.namespace.region}.scw.cloud`,
    };

    try {
      // validate the simple auth object (including serveraddress), not the map
      await docker.checkAuth(auth);
    } catch (err) {
      throw new Error(`Docker error : ${err}`);
    }

    const { containers } = this.provider.serverless.service.custom;

    const buildPromises = Object.keys(containers)
      .map((containerName) => {
        const containerConfig = {
          ...containers[containerName],
          name: containerName,
        };
        return containerConfig;
      })
      // If directory is not specified, the container does not need to be built,
      // we can directly create it from the registry image.
      .filter((containerConfig) => containerConfig.directory !== undefined)
      .map((containerConfig) => {
        validateContainerConfigBeforeBuild(containerConfig);

        return buildAndPushContainer.call(this, auth, containerConfig);
      });

    await Promise.all(buildPromises);
  },
};
