'use strict';

const BbPromise = require('bluebird');
const secrets = require('../../shared/secrets');
const singleSource = require('../../shared/singleSource');
const { RUNTIME_STATUS_AVAILABLE, RUNTIME_STATUS_EOL, RUNTIME_STATUS_EOS } = require('../../shared/runtimes');

module.exports = {
  createFunctions() {
    return BbPromise.bind(this)
      .then(() => this.listFunctions(this.namespace.id))
      .then(this.createOrUpdateFunctions);
  },

  deleteFunctionsByIds(funcIdsToDelete) {
    funcIdsToDelete.forEach((funcIdToDelete) => {
      this.deleteFunction(funcIdToDelete).then((res) => {
        this.serverless.cli.log(
          `Function ${res.name} removed from config file, deleting it...`
        );
        this.waitForFunctionStatus(funcIdToDelete, "deleted").then(
          this.serverless.cli.log(`Function ${res.name} deleted`)
        );
      });
    });
  },

  createOrUpdateFunctions(foundFunctions) {
    const { functions } = this.provider.serverless.service;

    const deleteData = singleSource.getElementsToDelete(
      this.serverless.configurationInput.singleSource,
      foundFunctions,
      Object.keys(functions),
    );

    this.deleteFunctionsByIds(deleteData.elementsIdsToRemove);

    const promises = deleteData.serviceNamesRet.map((functionName) => {
      const func = Object.assign(functions[functionName], {
        name: functionName,
      });

      const foundFunc = foundFunctions.find((f) => f.name === func.name);

      return foundFunc
        ? this.updateSingleFunction(func, foundFunc)
        : this.createSingleFunction(func);
    });

    return Promise.all(promises).then((updatedFunctions) => {
      this.functions = updatedFunctions;
    });
  },

  applyDomainsFunc(funcId, customDomains) {
    // we make a diff to know which domains to add or delete
    const domainsToCreate = [];
    const domainsIdToDelete = [];
    const existingDomains = [];

    this.listDomainsFunction(funcId).then((domains) => {
      domains.forEach((domain) => {
        existingDomains.push({ hostname: domain.hostname, id: domain.id });
      });

      if (
        customDomains !== undefined &&
        customDomains !== null &&
        customDomains.length > 0
      ) {
        customDomains.forEach((customDomain) => {
          domainsIdToDelete.push(customDomain.id);

          const domainFounds = existingDomains.filter(
            (existingDomain) => existingDomain.hostname === customDomain,
          );

          if (domainFounds.length === 0) {
            domainsToCreate.push(customDomain);
          }
        });
      }

      existingDomains.forEach((existingDomain) => {
        if (
          (customDomains === undefined || customDomains === null) &&
          existingDomain.id !== undefined
        ) {
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
          .then(
            () => {},
            (reason) => {
              this.serverless.cli.log(
                `Error on domain : ${newDomain}, reason : ${reason.message}`
              );

              if (reason.message.includes("could not validate")) {
                this.serverless.cli.log(
                  "Ensure CNAME configuration is ok, it can take some time for a record to propagate"
                );
              }
            }
          );
      });

      domainsIdToDelete.forEach((domainId) => {
        if (domainId === undefined) {
          return;
        }
        this.deleteDomain(domainId).then((res) => {
          this.serverless.cli.log(`Deleting domain ${res.hostname}`);
        });
      });
    });
  },

  validateRuntime(func, existingRuntimes, logger) {
    const existingRuntimesGroupedByLanguage = existingRuntimes.reduce(
      (r, a) => {
        r[a.language] = r[a.language] || [];
        r[a.language].push(a);
        return r;
      },
      Object.create(null)
    );

    const existingRuntimesByName = Object.values(
      existingRuntimesGroupedByLanguage
    )
      .flat()
      .reduce((map, r) => {
        map[r.name] = { status: r.status, statusMessage: r.status_message };
        return map;
      }, {});

    const currentRuntime = func.runtime || this.runtime;

    if (Object.keys(existingRuntimesByName).includes(currentRuntime)) {
      const runtime = existingRuntimesByName[currentRuntime];

      switch (runtime.status) {
        case RUNTIME_STATUS_AVAILABLE:
          return currentRuntime;

        case RUNTIME_STATUS_EOL:
          logger.log(`Runtime ${runtime.name} is in End Of Life. Functions that use this runtime will still be working, but it is no more possible to update them.
Note : ${runtime.statusMessage}

Runtime lifecycle doc : https://www.scaleway.com/en/docs/compute/functions/reference-content/functions-lifecycle/#available-runtimes

          `);
          return currentRuntime;

        case RUNTIME_STATUS_EOS:
          logger.log(`Runtime ${runtime.name} is in End Of Support. It is no longer possible to create a new function with this runtime; however, functions that already use it can still be updated.
Note : ${runtime.statusMessage}

Runtime lifecycle doc : https://www.scaleway.com/en/docs/compute/functions/reference-content/functions-lifecycle/#available-runtimes

           `);

          return currentRuntime;

        default:
          let warnMessage = `WARNING: Runtime ${currentRuntime} is in status ${runtime.status}`;
          if (
            runtime.statusMessage !== null &&
            runtime.statusMessage !== undefined &&
            runtime.statusMessage !== ""
          ) {
            warnMessage += `: ${runtime.statusMessage}`;
          }
          logger.log(warnMessage);

          return currentRuntime;
      }
    }

    let errorMessage = `Runtime "${currentRuntime}" does not exist`;
    if (existingRuntimes.length > 0) {
      errorMessage += `, must be one of: ${Object.keys(
        existingRuntimesByName
      ).join(", ")}`;
    } else {
      errorMessage += ": cannot list runtimes";
    }

    throw new Error(errorMessage);
  },

  async createSingleFunction(func) {
    const params = {
      name: func.name,
      environment_variables: func.env,
      secret_environment_variables: secrets.convertObjectToModelSecretsArray(
        func.secret
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

    const availableRuntimes = await this.listRuntimes();
    params.runtime = this.validateRuntime(
      func,
      availableRuntimes,
      this.serverless.cli,
    );

    // checking if there is custom_domains set on function creation.
    if (func.custom_domains && func.custom_domains.length > 0) {
      this.serverless.cli.log("WARNING: custom_domains are available on function update only. "+
        "Redeploy your function to apply custom domains. Doc : https://www.scaleway.com/en/docs/compute/functions/how-to/add-a-custom-domain-name-to-a-function/")
    }

    this.serverless.cli.log(`Creating function ${func.name}...`);

    return this.createFunction(params).then((response) =>
      Object.assign(response, { handler: func.handler })
    );
  },

  async updateSingleFunction(func, foundFunc) {
    const params = {
      redeploy: false,
      environment_variables: func.env,
      secret_environment_variables: await secrets.mergeSecretEnvVars(
        foundFunc.secret_environment_variables,
        secrets.convertObjectToModelSecretsArray(func.secret),
        this.serverless.cli
      ),
      memory_limit: func.memoryLimit,
      min_scale: func.minScale,
      max_scale: func.maxScale,
      timeout: func.timeout,
      handler: func.handler,
      privacy: func.privacy,
      domain_name: func.domain_name,
    };

    const availableRuntimes = await this.listRuntimes();
    params.runtime = this.validateRuntime(
      func,
      availableRuntimes,
      this.serverless.cli
    );

    this.serverless.cli.log(`Updating function ${func.name}...`);

    // assign domains
    this.applyDomainsFunc(foundFunc.id, func.custom_domains);

    return this.updateFunction(foundFunc.id, params).then((response) =>
      Object.assign(response, { handler: func.handler })
    );
  },
};
