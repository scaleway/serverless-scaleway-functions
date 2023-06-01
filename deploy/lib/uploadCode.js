"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const BbPromise = require("bluebird");

module.exports = {
  uploadCode() {
    return BbPromise.bind(this)
      .then(this.getPresignedUrlForFunctions)
      .then(this.uploadFunctionsCode);
  },

  getPresignedUrlForFunctions() {
    const promises = this.functions.map((func) => {
      const archivePath = path.resolve(
        this.serverless.config.servicePath,
        ".serverless",
        `${this.namespaceName}.zip`
      );
      const stats = fs.statSync(archivePath);
      const archiveSize = stats.size;

      // get presigned url
      return this.getPresignedUrl(func.id, archiveSize).then((response) =>
        Object.assign(func, {
          uploadUrl: response.url,
          uploadHeader: {
            content_length: archiveSize,
            "Content-Type": "application/octet-stream",
          },
        })
      );
    });

    return Promise.all(promises).catch(() => {
      throw new Error(
        "An error occured while getting a presigned URL to upload functions's archived code."
      );
    });
  },

  uploadFunctionsCode(functions) {
    this.serverless.cli.log("Uploading source code...");
    // Upload functions to s3
    const promises = functions.map((func) => {
      const archivePath = path.resolve(
        this.serverless.config.servicePath,
        ".serverless",
        `${this.namespaceName}.zip`
      );
      return new Promise((resolve, reject) => {
        fs.readFile(archivePath, (err, data) => {
          if (err) reject(err);
          resolve(data);
        });
      }).then((data) =>
        axios({
          data,
          method: "put",
          url: func.uploadUrl,
          headers: func.uploadHeader,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        })
      );
    });

    return Promise.all(promises);
  },
};
