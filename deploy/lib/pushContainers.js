'use strict';

const BbPromise = require('bluebird');
const Docker = require('dockerode');
const tar = require('tar-fs');

const docker = new Docker();

const promisifyStream = (stream, verbose) => new BbPromise((resolve, reject) => {
  stream.on('data', (data) => {
    if (verbose) {
      this.serverless.cli.log(data.toString().replace('\n', ''));
    }
  });
  stream.on('end', resolve);
  stream.on('error', reject);
});

module.exports = {
  pushContainers() {
    return BbPromise.bind(this)
      .then(this.buildAndPushContainer);
  },


  buildAndPushContainer() {
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

      return new BbPromise((resolve) => {
        docker.buildImage(tarStream, { t: imageName })
          .then(stream => promisifyStream(stream, this.provider.options.verbose))
          .then(() => docker.getImage(imageName))
          .then(image => image.push(auth))
          .then(stream => promisifyStream(stream, this.provider.options.verbose))
          .then(() => resolve());
      });
    });

    return Promise.all(promises);
  },

};
