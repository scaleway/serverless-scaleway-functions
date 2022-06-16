'use strict';
const YAML = require('js-yaml');

module.exports = {
  displayEmpty() {
    if (this.serverless.processedInput.commands.join(' ') === 'info') {
      const data = {"scaleway": {"key": "value"}}
      this.serverless.serviceOutputs.set('Stack Outputs', '\n' + YAML.dump(data));
    }
  },
};
