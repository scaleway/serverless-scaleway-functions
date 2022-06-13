'use strict';

const BbPromise = require('bluebird');

module.exports = {
  deployFunctions() {
    this.serverless.cli.log('Deploying Functions...');
    return BbPromise.bind(this)
      .then(this.deployEachFunction)
      .then(() => this.serverless.cli.log('Waiting for function deployments, this may take multiple minutes...'))
      .then(this.printFunctionInformationAfterDeployment);
  },

  deployEachFunction() {
    const promises = this.functions.map(
      func => this.deployFunction(func.id, {}),
    );

    return Promise.all(promises);
  },

  printFunctionInformationAfterDeployment() {
    return this.waitFunctionsAreDeployed(this.namespace.id).then(
      (functions) => {
        functions.forEach((func) => {
          this.serverless.cli.log(
            `Function ${func.name} has been deployed to: https://${func.domain_name}`,
          );

          let printableDomains = '';
          this.listDomains(func.id).then(
            (domains) => {
              domains.forEach((domain) => {
                printableDomains += `\t\n - ${domain.hostname}`;
              });

              if (domains.length > 0) {
                this.serverless.cli.log(
                  `Related function domain(s) : ${printableDomains}`,
                );
              }
            },
          );

          if (
            func.runtime_message !== undefined
            && func.runtime_message !== ''
          ) {
            this.serverless.cli.log(
              `Runtime information : ${func.runtime_message}`,
            );
          }
        });
      },
    );
  },
};
