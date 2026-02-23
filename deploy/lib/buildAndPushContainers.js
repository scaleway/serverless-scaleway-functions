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

module.exports = {
  async buildAndPushContainers() {
    const auth = {
      username: "any",
      password: this.provider.scwToken,
    };

    // Used for building: see https://docs.docker.com/engine/api/v1.37/#tag/Image/operation/ImageBuild
    const registryAuth = { [`rg.${this.provider.region}.scw.cloud`]: auth };

    try {
      await docker.checkAuth(registryAuth);
    } catch (err) {
      throw new Error(`Docker error : ${err}`);
    }

    const containerNames = Object.keys(this.containers);
    const promises = containerNames.map((containerName) => {
      const container = this.containers[containerName];
      if (container["directory"] === undefined) {
        return;
      }

      if (
        container["buildArgs"] !== undefined &&
        typeof container["buildArgs"] !== "object"
      ) {
        throw new Error(
          `Build arguments for container ${containerName} should be an object.

          Example:
          containers:
            ${containerName}:
              directory: my-container-directory
              buildArgs:
                MY_BUILD_ARG: "my-value"
          `
        );
      }

      const imageName = `${this.namespace.registry_endpoint}/${container.name}:latest`;

      this.serverless.cli.log(
        `Building and pushing container ${container.name} to: ${imageName} ...`
      );

      let buildOptions = {
        t: imageName,
        registryconfig: registryAuth,
      };

      if (container.buildArgs !== undefined) {
        buildOptions.buildargs = container.buildArgs;
      }

      // eslint-disable-next-line no-async-promise-executor
      return new Promise(async (resolve, reject) => {
        const buildStream = await docker.buildImage(
          {
            context: container.directory,
            src: getFilesInBuildContextDirectory(container.directory),
          },
          buildOptions
        );
        const buildStreamEvents = await extractStreamContents(
          buildStream,
          this.provider.options.verbose
        );

        const buildError = findErrorInBuildOutput(buildStreamEvents);
        if (buildError !== undefined) {
          reject(`Build did not succeed, error: ${buildError}`);
          return;
        }

        const image = docker.getImage(imageName);

        const inspectedImage = await image
          .inspect()
          .catch(() =>
            reject(
              `Image ${imageName} does not exist: run --verbose to see errors`
            )
          );

        if (inspectedImage === undefined) {
          return;
        }

        if (inspectedImage["Architecture"] !== "amd64") {
          reject(
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
          return;
        }

        const pushStream = await image.push({ authconfig: auth });
        await extractStreamContents(pushStream, this.provider.options.verbose);

        resolve();
      });
    });

    return Promise.all(promises);
  },
};
