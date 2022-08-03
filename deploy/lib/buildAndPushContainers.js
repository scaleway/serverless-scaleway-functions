'use strict';

const Docker = require('dockerode');
const tar = require('tar-fs');

const docker = new Docker();

const promisifyStream = (stream, verbose) => new Promise((resolve, reject) => {
  stream.on('data', (data) => {
    if (verbose) {
      console.log(data.toString().replace('\n', ''));
    }
  });
  stream.on('end', resolve);
  stream.on('error', reject);
});

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
        await promisifyStream(buildStream, this.provider.options.verbose);

        const image = docker.getImage(imageName)

        const inspectedImage = await image.inspect()
          .catch(() => reject("Error during build of the image "+imageName+": run --verbose to see the error"));

        if (inspectedImage === undefined) {
          return
        }

        if (inspectedImage['Architecture'] !== 'amd64') {
          reject("It appears that image have been built with " + inspectedImage['Architecture'] + " architecture. " +
            "To build a compatible image with Scaleway serverless containers, " +
            "the platform of the built image must be `linux/amd64`. " +
            "Please pull your image's base image with platform `linux/amd64`: " +
            "first (`docker pull --platform=linux/amd64 <your_base_image>`), " +
            "and then run `serverless deploy`.")
          return
        }

        const pushStream = await image.push(auth);
        await promisifyStream(pushStream, this.provider.options.verbose);

        resolve();
      });
    });

    return Promise.all(promises);
  },

};
