'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const BbPromise = require('bluebird');
const constants = require('./constants');

module.exports = {
  uploadCode() {
    return BbPromise.bind(this)
      .then(this.getPresignedUrl)
      .then(this.uploadFunctionsCode);
  },

  getPresignedUrl() {
    // get archive size
    // get presigned url
    const promises = this.functions.map((func) => {
      const archivePath = path.resolve(constants.SERVERLESS_DIRECTORY, `${this.namespaceName}.zip`);
      const stats = fs.statSync(archivePath);
      const archiveSize = stats.size;

      // get presigned url
      return this.provider.apiManager.get(`/functions/${func.id}/upload-url?content_length=${archiveSize}`)
        .then(response => Object.assign(func, {
          uploadUrl: response.data.url,
          uploadHeader: response.data.headers,
        }));
    });

    return Promise.all(promises)
      .catch(() => {
        throw new Error('An error occured while getting a presigned URL to upload functions\'s archived code.');
      });
  },

  uploadFunctionsCode(functions) {
    this.serverless.cli.log('Uploading source code...');
    // Upload functions to s3
    const promises = functions.map((func) => {
      const archivePath = path.resolve(constants.SERVERLESS_DIRECTORY, `${this.namespaceName}.zip`);
      return new Promise((resolve, reject) => {
        fs.readFile(archivePath, (err, data) => {
          if (err) reject(err);
          resolve(data);
        });
      })
      .then(data => axios({
        data,
        method: 'put',
        url: func.uploadUrl,
        headers: Object.assign(func.uploadHeader, {
          'Content-Type': 'application/octet-stream',
        }),
        maxContentLength: 1000000000,
      }));
    });

    return Promise.all(promises);
  },
};
