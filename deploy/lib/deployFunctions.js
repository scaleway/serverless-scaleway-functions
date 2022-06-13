'use strict';

const BbPromise = require('bluebird');

const util = require('util')

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
    // console.log(util.inspect(func, {showHidden: false, depth: null, colors: true}))
    

    return this.waitFunctionsAreDeployed(this.namespace.id).then(
      (functions) => {
        console.log("return this.waitFunctionsAreDeployed updateSingleFunction");

      
          this.serverless.cli.log(
            `Function ${func.name} has been deployed to: https://${func.domain_name}`,
          );

          functions.forEach((func) => {
            this.listDomains(func.id).then(
              (domains) => {
                domains.forEach((domain) => {
                    this.serverless.cli.log(
                      `First Related function domain(s) : ${domain}`
                    )
                })
              }
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
