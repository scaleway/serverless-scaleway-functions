'use strict';

const ScalewayProvider = require('./provider/scalewayProvider');
const ScalewayDeploy = require('./deploy/scalewayDeploy');
const ScalewayRemove = require('./remove/scalewayRemove');
const ScalewayJwt = require('./jwt/scalewayJwt');

class ScalewayIndex {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.serverless.pluginManager.addPlugin(ScalewayProvider);
    this.serverless.pluginManager.addPlugin(ScalewayDeploy);
    this.serverless.pluginManager.addPlugin(ScalewayRemove);
    this.serverless.pluginManager.addPlugin(ScalewayJwt);
  }
}

module.exports = ScalewayIndex;
