'use strict';

const Docker = require('dockerode');
const tar = require('tar-fs');

const docker = new Docker();

function extractStreamContents(stream, verbose) {
  return new Promise((resolve, reject) => {
    const streamContent = [];

    stream.on('data', (data) => {
      const streamData = data.toString().replace('\n', '')
      streamContent.push(streamData);

      if (verbose) {
        console.log(streamData);
      }
    });

    stream.on('end', () => {
      resolve(streamContent);
    });
    stream.on('error', reject);
  });
}

function findErrorInBuildOutput(buildOutput) {
  for (let i = 0; i < buildOutput.length; i++) {
    if (buildOutput[i].startsWith('{"errorDetail":{')) {
      const errorDetail = JSON.parse(buildOutput[i])['errorDetail'];
      if (errorDetail['message'] !== undefined) {
        return errorDetail['message'];
      }
      return JSON.stringify(errorDetail);
    }
  }
}

module.exports = {
  buildAndPushContainers() {
    const auth = {
      username: 'any',
      password: this.provider.scwToken,
    };

    const containerNames = Object.keys(this.containers);
    const promises = containerNames.map((containerName) => {
      const container = this.containers[containerName];
      const tarStream = tar.pack(`./${container.directory}`);
      const imageName = `${this.namespace.registry_endpoint}/${container.name}:latest`;

      this.serverless.cli.log(`Building and pushing container ${container.name} to: ${imageName} ...`);

      return new Promise(async (resolve, reject) => {
        const buildStream = await docker.buildImage(tarStream, { t: imageName })
        const buildStreamEvents = await extractStreamContents(buildStream, this.provider.options.verbose);

        const buildError = findErrorInBuildOutput(buildStreamEvents);
        if (buildError !== undefined) {
          reject("Build did not succeed, error: "+buildError);
          return
        }

        const image = docker.getImage(imageName)

        const inspectedImage = await image.inspect()
          .catch(() => reject("Image "+imageName+" does not exist: run --verbose to see errors"));

        if (inspectedImage === undefined) {
          return
        }

        if (inspectedImage['Architecture'] !== 'amd64') {
          reject("It appears that image have been built with " + inspectedImage['Architecture'] + " architecture. " +
            "To build a compatible image with Scaleway serverless containers, " +
            "the platform of the built image must be `linux/amd64`. " +
            "Please pull your image's base image with platform `linux/amd64`: " +
            "first (`docker pull --platform=linux/amd64 <your_base_image>`), " +
            "and just after, run `serverless deploy`. You shouldn't pull the other " +
            "image architecture between those two steps.")
          return
        }

        const pushStream = await image.push(auth);
        await extractStreamContents(pushStream, this.provider.options.verbose);

        resolve();
      });
    });

    return Promise.all(promises);
  },

};
