"use strict";

const { mapWithConcurrency } = require("../../shared/concurrency");
const DEPLOY_FUNCTIONS_CONCURRENCY = 5; // max number of functions deployed at a time

module.exports = {
  async deployFunctions() {
    this.serverless.cli.log("Deploying Functions...");
    await this.deployEachFunction();
  },

  async deployEachFunction() {
    await mapWithConcurrency(
      this.functions,
      DEPLOY_FUNCTIONS_CONCURRENCY,
      async (func) => {
        const deployedFunc = await this.deployFunction(func.id, {});
        this.serverless.cli.log(`Deploying ${deployedFunc.name}...`);
        const readyFunc = await this.waitForFunctionStatus(
          deployedFunc.id,
          "ready"
        );
        this.printFunctionInformationAfterDeployment(readyFunc);
        await this.waitForDomainsDeployment(readyFunc);
        return readyFunc;
      }
    );
  },

  printFunctionInformationAfterDeployment(func) {
    this.serverless.cli.log(
      `Function ${func.name} has been deployed to: https://${func.domain_name}`
    );

    if (func.runtime_message !== undefined && func.runtime_message !== "") {
      this.serverless.cli.log(`Runtime information : ${func.runtime_message}`);
    }

    return func;
  },

  async waitForDomainsDeployment(func) {
    this.serverless.cli.log(`Waiting for ${func.name} domains deployment...`);

    const domains = await this.waitDomainsAreDeployedFunction(func.id);
    domains.forEach((domain) => {
      this.serverless.cli.log(
        `Domain ready (${func.name}): ${domain.hostname}`
      );
    });
    this.serverless.cli.log(`Domains for ${func.name} have been deployed!`);
    return func;
  },
};
