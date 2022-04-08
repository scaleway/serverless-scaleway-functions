'use strict';

const BbPromise = require('bluebird');
const { FUNCTIONS_API_URL } = require('../shared/constants');
const { CONTAINERS_API_URL } = require('../shared/constants');

const providerName = 'scaleway';

class ScalewayProvider {
  static getProviderName() {
    return providerName;
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this;
    this.serverless.setProvider(providerName, this);
  }

  getScwProject() {
    return this.scwProject;
  }

  getFunctionCredentials() {
    return {
      apiUrl: this.apiFunctionUrl,
      token: this.scwToken,
    };
  }

  getContainerCredentials() {
    return {
      apiUrl: this.apiContainerUrl,
      token: this.scwToken,
    };
  }

  setCredentials(options) {
    if (options['scw-token'] && options['scw-project']) {
      this.serverless.cli.log('Using credentials from command line parameters');
      this.scwToken = options['scw-token'];
      this.scwProject = options['scw-project'];
    } else if (process.env.SCW_SECRET_KEY && process.env.SCW_DEFAULT_PROJECT_ID) {
      this.serverless.cli.log('Using credentials from system environment');
      this.scwToken = process.env.SCW_SECRET_KEY;
      this.scwProject = process.env.SCW_DEFAULT_PROJECT_ID;
    } else if (process.env.SCW_TOKEN && process.env.SCW_PROJECT) {
      this.serverless.cli.log('Using credentials from system environment');
      this.serverless.cli.log('NOTICE: you are using deprecated environment variable notation,');
      this.serverless.cli.log('please update to SCW_SECRET_KEY and SCW_DEFAULT_PROJECT_ID'); 
      this.scwToken = process.env.SCW_TOKEN;
      this.scwProject = process.env.SCW_PROJECT;
    } else {
      this.serverless.cli.log('Using credentials from yml');
      this.scwToken = this.serverless.service.provider.scwToken || '';
      this.scwProject = this.serverless.service.provider.scwProject || '';
    }
  }

  initialize(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    return new BbPromise((resolve) => {
      this.setCredentials(options);

      this.apiFunctionUrl = FUNCTIONS_API_URL;
      this.apiContainerUrl = CONTAINERS_API_URL;
      resolve();
    });
  }
}

module.exports = ScalewayProvider;
