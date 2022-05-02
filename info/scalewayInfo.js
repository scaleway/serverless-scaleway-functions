const BbPromise = require('bluebird');
const display = require('./lib/display');
const writeServiceOutputs = require('../shared/write-service-outputs');

class ScalewayInfo {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};

    Object.assign(
      this,
      display,
    );

    this.commands = {
      scaleway: {
        type: 'entrypoint',
        commands: {
          info: {
            lifecycleEvents: [
              'displayEmpty',
            ],
          },
        },
      },
    };

    this.hooks = {
      'info:info': () => this.serverless.pluginManager.spawn('scaleway:info'),
      'scaleway:info:displayEmpty': async () => BbPromise.bind(this).then(this.displayEmpty),
      'finalize': () => {
        if (this.serverless.processedInput.commands.join(' ') !== 'info') return;
        writeServiceOutputs(this.serverless.serviceOutputs);
      },
    };
  }
}

module.exports = ScalewayInfo;
