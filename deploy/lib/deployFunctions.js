"use strict";

const BbPromise = require("bluebird");
const DEPLOY_FUNCTIONS_CONCURRENCY = 5; // max number of functions deployed at a time

module.exports = {
  deployFunctions() {
    this.serverless.cli.log("Deploying Functions...");
    return BbPromise.bind(this).then(this.deployEachFunction);
  },

  deployEachFunction() {
    return BbPromise.map(
      this.functions,
      (func) => {
        return this.deployFunction(func.id, {})
          .then((func) => {
            this.serverless.cli.log(`Deploying ${func.name}...`);
            return func;
          })
          .then((func) => this.waitForFunctionStatus(func.id, "ready"))
          .then((func) => this.printFunctionInformationAfterDeployment(func))
          .then((func) => this.waitForDomainsDeployment(func));
      },
      { concurrency: DEPLOY_FUNCTIONS_CONCURRENCY }
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

  waitForDomainsDeployment(func) {
    this.serverless.cli.log(`Waiting for ${func.name} domains deployment...`);

    this.waitDomainsAreDeployedFunction(func.id).then((domains) => {
      domains.forEach((domain) => {
        this.serverless.cli.log(
          `Domain ready (${func.name}): ${domain.hostname}`
        );
      });
      this.serverless.cli.log(`Domains for ${func.name} have been deployed!`);
    });
  },
};
