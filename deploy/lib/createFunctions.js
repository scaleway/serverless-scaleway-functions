'use strict';

const BbPromise = require('bluebird');
const secrets = require('../../shared/secrets');
const { RUNTIME_STATUS_AVAILABLE } = require('../../shared/runtimes');

module.exports = {
  createFunctions() {
    return BbPromise.bind(this)
      .then(() => this.listFunctions(this.namespace.id))
      .then(this.createOrUpdateFunctions);
  },

  createOrUpdateFunctions(foundFunctions) {
    const { functions } = this.provider.serverless.service;

    const functionNames = Object.keys(functions);

    const deletedFunctionsNames = [];

    if (this.serverless.configurationInput.singleSource !== undefined
      && this.serverless.configurationInput.singleSource !== null
      && this.serverless.configurationInput.singleSource === true) {
      // if a function is available in the API but not in the serverlsssyml file, remove it
      for (let i = 0; i < foundFunctions.length; i++) {
        const apiFunc = foundFunctions[i];

        for (let ii = 0; ii < functionNames.length; ii++) {
          const funcName = functionNames[ii];

          if (apiFunc === funcName) {
            functionNames.slice(ii, 1);
            break;
          }
        }

        if (!functionNames.includes(apiFunc.name)) {
        // function is in the API but not in serverless.yml file, remove it
          this.deleteFunction(apiFunc.id)
            .then((res) => {
              this.serverless.cli.log(`Function ${res.name} removed from config file, deleting it...`);
              this.waitForFunctionStatus(apiFunc.id, "deleted").then(this.serverless.cli.log(`Function ${res.name} deleted`));

              deletedFunctionsNames.push(apiFunc.name);
            });
        }
      }
    }
    const promises = functionNames.map((functionName) => {
      const func = Object.assign(functions[functionName], { name: functionName });

      const foundFunc = foundFunctions.find((f) => f.name === func.name);

      return foundFunc
        ? this.updateSingleFunction(func, foundFunc)
        : this.createSingleFunction(func);
    });

    return Promise.all(promises)
      .then((updatedFunctions) => {
        this.functions = updatedFunctions;
      });
  },

  applyDomains(funcId, customDomains) {
    // we make a diff to know which domains to add or delete
    const domainsToCreate = [];
    const domainsIdToDelete = [];
    const existingDomains = [];

    this.listDomains(funcId).then((domains) => {
      domains.forEach((domain) => {
        existingDomains.push({ hostname: domain.hostname, id: domain.id });
      });

      if (customDomains !== undefined && customDomains !== null && customDomains.length > 0) {
        customDomains.forEach((customDomain) => {
          domainsIdToDelete.push(customDomain.id);

          let domainFound = false;

          existingDomains.forEach((existingDom) => {
            if (existingDom.hostname === customDomain) {
              domainFound = true;
              return false;
            }
          });
          if (!domainFound) {
            domainsToCreate.push(customDomain);
          }
        });
      }

      existingDomains.forEach((existingDomain) => {
        if ((customDomains === undefined || customDomains === null)
          && existingDomain.id !== undefined) {
          domainsIdToDelete.push(existingDomain.id);
        } else if (!customDomains.includes(existingDomain.hostname)) {
          domainsIdToDelete.push(existingDomain.id);
        }
      });

      domainsToCreate.forEach((newDomain) => {
        const createDomainParams = { function_id: funcId, hostname: newDomain };

        this.createDomain(createDomainParams)
          .then((res) => {
            this.serverless.cli.log(`Creating domain ${res.hostname}`);
          })
          .then(() => {}, (reason) => {
            this.serverless.cli.log(`Error on domain : ${newDomain}, reason : ${reason.message}`);

            if (reason.message.includes("could not validate")) {
              this.serverless.cli.log("Ensure CNAME configuration is ok, it can take some time for a record to propagate");
            }
          });
      });

      domainsIdToDelete.forEach((domainId) => {
        if (domainId === undefined) {
          return;
        }
        this.deleteDomain(domainId)
          .then((res) => {
            this.serverless.cli.log(`Deleting domain ${res.hostname}`);
          });
      });
    });
  },

  validateRuntime(func, existingRuntimes, logger) {
    const existingRuntimesGroupedByLanguage = existingRuntimes
      .reduce((r, a) => {
        r[a.language] = r[a.language] || [];
        r[a.language].push(a);
        return r;
      }, Object.create(null));

    const existingRuntimesByName = Object.values(existingRuntimesGroupedByLanguage)
      .flat()
      .reduce((map, r) => {
        map[r.name] = { status: r.status, statusMessage: r.status_message };
        return map;
      }, {});

    const currentRuntime = func.runtime || this.runtime;

    if (Object.keys(existingRuntimesByName).includes(currentRuntime)) {
      const runtime = existingRuntimesByName[currentRuntime];
      if (runtime.status !== RUNTIME_STATUS_AVAILABLE) {
        let warnMessage = `WARNING: Runtime ${currentRuntime} is in status ${runtime.status}`;
        if (runtime.statusMessage !== null && runtime.statusMessage !== undefined && runtime.statusMessage !== '') {
          warnMessage += `: ${runtime.statusMessage}`;
        }
        logger.log(warnMessage);
      }
      return currentRuntime;
    }

    let errorMessage = `Runtime "${currentRuntime}" does not exist`;
    if (existingRuntimes.length > 0) {
      errorMessage += `, must be one of: ${Object.keys(existingRuntimesByName).join(', ')}`;
    } else {
      errorMessage += ': cannot list runtimes';
    }

    throw new Error(errorMessage);
  },

  async createSingleFunction(func) {
    const params = {
      name: func.name,
      environment_variables: func.env,
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        func.secret,
      ),
      namespace_id: this.namespace.id,
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      timeout: func.timeout,
      handler: func.handler,
      privacy: func.privacy,
      domain_name: func.domain_name,
    };

    // if set to true, ensure that we keep serverless config file as single source of truth
    // (deleting other ressources not present in file)
    if (func.single_source === null || func.single_source === undefined) {
      // params.single_source = false;
    }

    const availableRuntimes = await this.listRuntimes();
    params.runtime = this.validateRuntime(func, availableRuntimes, this.serverless.cli);

    // checking if there is custom_domains set on function creation.
    if (func.custom_domains && func.custom_domains.length > 0) {
      this.serverless.cli.log("WARNING: custom_domains are available on function update only. "+
        "Redeploy your function to apply custom domains. Doc : https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/")
    }

    this.serverless.cli.log(`Creating function ${func.name}...`);

    return this.createFunction(params)
      .then((response) => Object.assign(response, { handler: func.handler }));
  },

  async updateSingleFunction(func, foundFunc) {
    const params = {
      redeploy: false,
      environment_variables: func.env,
      secret_environment_variables: await secrets.mergeSecretEnvVars(
        foundFunc.secret_environment_variables,
        secrets.convertObjectToModelSecretsArray(func.secret),
        this.serverless.cli,
      ),
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      timeout: func.timeout,
      handler: func.handler,
      privacy: func.privacy,
      domain_name: func.domain_name,
    };

    // if set to true, ensure that we keep serverless config file as single source of truth
    // (deleting other ressources not present in file)
    if (func.single_source === null || func.single_source === undefined) {
      // params.single_source = false;
    }

    const availableRuntimes = await this.listRuntimes();
    params.runtime = this.validateRuntime(func, availableRuntimes, this.serverless.cli);

    this.serverless.cli.log(`Updating function ${func.name}...`);

    // assign domains
    this.applyDomains(foundFunc.id, func.custom_domains);

    return this.updateFunction(foundFunc.id, params)
      .then((response) => Object.assign(response, { handler: func.handler }));
  },
};
