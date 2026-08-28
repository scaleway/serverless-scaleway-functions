"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");

module.exports = {
  async uploadCode() {
    const functions = await this.getPresignedUrlForFunctions();
    return this.uploadFunctionsCode(functions);
  },

  getPresignedUrlForFunctions() {
    const promises = this.functions.map((func) => {
      const archivePath = path.resolve(
        this.serverless.config.servicePath,
        ".serverless",
        `${this.namespaceName}.zip`,
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
        }),
      );
    });

    return Promise.all(promises).catch(() => {
      throw new Error(
        "An error occured while getting a presigned URL to upload functions's archived code.",
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
        `${this.namespaceName}.zip`,
      );
      return fs.promises.readFile(archivePath).then((data) =>
        axios({
          data,
          method: "put",
          url: func.uploadUrl,
          headers: func.uploadHeader,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }),
      );
    });

    return Promise.all(promises);
  },
};
