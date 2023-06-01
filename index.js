"use strict";

const ScalewayProvider = require("./provider/scalewayProvider");
const ScalewayDeploy = require("./deploy/scalewayDeploy");
const ScalewayRemove = require("./remove/scalewayRemove");
const ScalewayInvoke = require("./invoke/scalewayInvoke");
const ScalewayJwt = require("./jwt/scalewayJwt");
const ScalewayLogs = require("./logs/scalewayLogs");
const ScalewayInfo = require("./info/scalewayInfo");

class ScalewayIndex {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.serverless.pluginManager.addPlugin(ScalewayProvider);
    this.serverless.pluginManager.addPlugin(ScalewayDeploy);
    this.serverless.pluginManager.addPlugin(ScalewayRemove);
    this.serverless.pluginManager.addPlugin(ScalewayInvoke);
    this.serverless.pluginManager.addPlugin(ScalewayJwt);
    this.serverless.pluginManager.addPlugin(ScalewayLogs);
    this.serverless.pluginManager.addPlugin(ScalewayInfo);
  }
}

module.exports = ScalewayIndex;
