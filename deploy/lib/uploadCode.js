"use strict";

const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

module.exports = {
  async uploadCode() {
    await this.getPresignedUrlForFunctions();
    await this.uploadFunctionsCode(this.functions);
  },

  async getPresignedUrlForFunctions() {
    const promises = this.functions.map(async (func) => {
      const archivePath = path.resolve(
        this.serverless.config.servicePath,
        ".serverless",
        `${this.namespaceName}.zip`
      );
      const stats = await fs.stat(archivePath);
      const archiveSize = stats.size;

      // get presigned url
      const response = await this.getPresignedUrl(func.id, archiveSize);
      Object.assign(func, {
        uploadUrl: response.url,
        uploadHeader: {
          content_length: archiveSize,
          "Content-Type": "application/octet-stream",
        },
      });
    });

    await Promise.all(promises).catch(() => {
      throw new Error(
        "An error occured while getting a presigned URL to upload functions's archived code."
      );
    });
  },

  async uploadFunctionsCode(functions) {
    this.serverless.cli.log("Uploading source code...");
    // Upload functions to s3
    const promises = functions.map(async (func) => {
      const archivePath = path.resolve(
        this.serverless.config.servicePath,
        ".serverless",
        `${this.namespaceName}.zip`
      );
      const data = await fs.readFile(archivePath);
      return axios({
        data,
        method: "put",
        url: func.uploadUrl,
        headers: func.uploadHeader,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    });

    return Promise.all(promises);
  },
};
