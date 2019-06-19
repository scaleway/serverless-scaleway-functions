'use strict';

const https = require('https');
const axios = require('axios');
const BbPromise = require('bluebird');

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

  getScwOrganization() {
    return this.scwOrganization;
  }

  setCredentials(options) {
    if (options['scw-token'] && options['scw-organization']) {
      this.serverless.cli.log('Using credentials from command line parameters');
      this.scwToken = options['scw-token'];
      this.scwOrganization = options['scw-organization'];
    } else if (process.env.SCW_TOKEN && process.env.SCW_ORGANIZATION) {
      this.serverless.cli.log('Using credentials from system environment');
      this.scwToken = process.env.SCW_TOKEN;
      this.scwOrganization = process.env.SCW_ORGANIZATION;
    } else {
      this.serverless.cli.log('Using credentials from yml');
      this.scwToken = this.serverless.service.provider.scwToken || '';
      this.scwOrganization = this.serverless.service.provider.scwOrganization || '';
    }
  }

  initialize(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    return new BbPromise((resolve) => {
      this.setCredentials(options);

      this.apiUrl = 'https://api.scaleway.com/functions/v1alpha2/regions/fr-par';
      this.defaultStage = 'dev';
      this.apiManager = axios.create({
        baseURL: this.apiUrl,
        headers: {
          'X-Auth-Token': this.scwToken,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      resolve();
    });
  }
}

module.exports = ScalewayProvider;
