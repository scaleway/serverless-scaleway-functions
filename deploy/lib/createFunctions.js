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
    const promises = functionNames.map((functionName) => {
      const func = Object.assign(functions[functionName], { name: functionName });
      const foundFunc = foundFunctions.find(f => f.name === func.name);
      return foundFunc
        ? this.updateSingleFunction(func, foundFunc)
        : this.createSingleFunction(func);
    });

    return Promise.all(promises)
      .then((updatedFunctions) => {
        this.functions = updatedFunctions;
      });
  },

  applyDomains(funcId, custom_domains) {
    // we make a diff to know which domains to add or delete
    let domainsToCreate = [];
    let domainsIdToDelete = [];
    let existingDomains = [];

    this.listDomains(funcId).then(
      (domains) => {
      domains.forEach((domain) => {
          existingDomains.push({ hostname: domain.hostname, id: domain.id });
        });
        
        
        for (let idx = 0; idx < existingDomains.length; idx++) {
          const existingDom = existingDomains[idx].hostname;
          if (!custom_domains.includes(existingDom)) {
            domainsToCreate.push()
          }
        }

        custom_domains.forEach((customDomain) => {
          let hnFound = false;
          for (let idx = 0; idx < existingDomains.length; idx++) {
            const existing = existingDomains[idx].hostname;
            if (existing === customDomain) {
              hnFound = true;
              break;
            }
          }

          if(!hnFound) {
            domainsToCreate.push(customDomain);
          }
        });

        existingDomains.forEach((existingDomain) => {
          if (!custom_domains.includes(existingDomain.hostname)) {
            domainsIdToDelete.push(existingDomain.id);
          } 
        });

        domainsToCreate.forEach((newDomain) => {
          this.createDomain({ function_id: funcId, hostname: newDomain }).
          then((res) => console.log("create domain : ", res.data))
        });

        domainsIdToDelete.forEach((domainId) => {
          this.deleteDomain( domainId).
          then((res) => console.log("delete domain : ", res))
        });
      },
    );
    
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
    console.log(util.inspect(func, {showHidden: false, depth: null, colors: true}))
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

    const availableRuntimes = await this.listRuntimes();
    params.runtime = this.validateRuntime(func, availableRuntimes, this.serverless.cli);

    this.serverless.cli.log(`Creating function ${func.name}...`);
    return this.createFunction(params)
      .then(response => Object.assign(response, { handler: func.handler }));
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

    const availableRuntimes = await this.listRuntimes();
    params.runtime = this.validateRuntime(func, availableRuntimes, this.serverless.cli);

    this.serverless.cli.log(`Updating function ${func.name}...`);

    // assign domains
    this.applyDomains(foundFunc.id, func.custom_domains);

    return this.updateFunction(foundFunc.id, params)
      .then((response) => Object.assign(response, { handler: func.handler }));
  },
};
