'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const path = require('path');

// COMPILED_RUNTIMES_PREFIXES is an array containing all runtimes
// that are considered as "compiled runtimes".
// If you fill this array with "go" it will match all runtimes that starts with "go".
// For example "golang", "go113" matches this filter.
const COMPILED_RUNTIMES_PREFIXES = ['go'];

// RUNTIMES_EXTENSIONS serves two purposes :
// - the struct key is used to list different runtimes families (go, python etc...)
// - the content is used to list file extensions of the runtime, file extensions are only
// required on non-compiled runtimes.
const RUNTIMES_EXTENSIONS = {
  // tester .ts in node runtime
  node: ['ts', 'js'],
  python: ['py'],
  go: [],
};

const REGION_LIST = ['fr-par', 'nl-ams', 'pl-waw'];

const cronScheduleRegex = new RegExp(
  /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
);

const TRIGGERS_VALIDATION = {
  schedule: (trigger) => {
    if (!trigger.rate || !cronScheduleRegex.test(trigger.rate)) {
      throw new Error(`Trigger Schedule is invalid: ${trigger.rate}, schedule should be formatted like a UNIX-Compliant Cronjob, for example: '1 * * * *'`);
    }
  },
};

module.exports = {
  validate() {
    return BbPromise.bind(this)
      .then(this.validateServicePath)
      .then(this.validateCredentials)
      .then(this.validateRegion)
      .then(this.validateNamespace)
      .then(this.validateApplications)
      .then(this.checkErrors);
  },

  validateServicePath() {
    if (!this.serverless.config.servicePath) {
      throw new Error('This command can only be run inside a service directory');
    }

    return BbPromise.resolve();
  },

  validateCredentials() {
    if (this.provider.scwToken.length !== 36 || this.provider.getScwProject().length !== 36) {
      const errorMessage = [
        'Either "scwToken" or "scwProject" is invalid.',
        ' Credentials to deploy on your Scaleway Account are required, please read the documentation.',
      ].join('');
      throw new Error(errorMessage);
    }
  },

  validateRegion() {
    if (!REGION_LIST.includes(this.provider.scwRegion)) {
      throw new Error('unknown region');
    }
  },

  checkErrors(errors) {
    if (!errors || !errors.length) {
      return BbPromise.resolve();
    }

    // Format error messages for user
    return BbPromise.reject(errors);
  },

  validateNamespace(errors) {
    const currentErrors = Array.isArray(errors) ? errors : [];
    // Check space env vars:
    const namespaceEnvVars = this.serverless.service.provider.env;
    const namespaceErrors = this.validateEnv(namespaceEnvVars);

    return BbPromise.resolve(currentErrors.concat(namespaceErrors));
  },

  validateApplications(errors) {
    let functionNames = [];
    let containerNames = [];

    const currentErrors = Array.isArray(errors) ? errors : [];
    let functionErrors = [];
    let containers = [];

    let extensions = [];

    const { functions } = this.serverless.service;

    if (functions && Object.keys(functions).length !== 0) {
      functionNames = Object.keys(functions);

      let defaultRTexists = false;

      const rtKeys = Object.getOwnPropertyNames(RUNTIMES_EXTENSIONS);
      for (let i = 0; i < rtKeys.length; i += 1) {
        if (this.runtime.startsWith(rtKeys[i])) {
          defaultRTexists = true;
          extensions = RUNTIMES_EXTENSIONS[rtKeys[i]];

          break;
        }
      }


      if (!defaultRTexists) {
        functionErrors.push(`Runtime ${this.runtime} is not supported, please check documentation for available runtimes`);
      }

      functionNames.forEach((functionName) => {
        const func = functions[functionName];

        // check if runtime is compiled runtime, if so we skip validations
        for (let i = 0; i < COMPILED_RUNTIMES_PREFIXES.length; i += 1) {
          if (
            func.runtime !== undefined
            && (func.runtime.startsWith(COMPILED_RUNTIMES_PREFIXES[i])
            || (!func.runtime && this.runtime.startsWith(COMPILED_RUNTIMES_PREFIXES[i])))) {
            return; // for compiled runtimes there is no need to validate specific files
          }
        }

        // Check that function's runtime is authorized if existing
        if (func.runtime) {
          let RTexists = false;

          for (let i = 0; i < rtKeys.length; i += 1) {
            if (func.runtime.startsWith(rtKeys[i])) {
              RTexists = true;
              extensions = RUNTIMES_EXTENSIONS[rtKeys[i]];
              break;
            }
          }

          if (!RTexists) {
            functionErrors.push(
              `Runtime ${func.runtime} is not supported, please check documentation for available runtimes`,
            );
          }
        }

        // Check if function handler exists
        try {
          // get handler file => path/to/file.handler => split ['path/to/file', 'handler']
          const splitHandlerPath = func.handler.split('.');
          if (splitHandlerPath.length !== 2) {
            throw new Error(`Handler is malformatted for ${functionName}: handler should be path/to/file.functionInsideFile`);
          }

          const handlerPath = splitHandlerPath[0];

          // For each extensions linked to a language (node: .ts,.js, python: .py ...),
          // check that a handler file exists with one of the extensions
          let handlerFileExists = false;

          for (let i = 0; i < extensions.length; i += 1) {
            const handler = `${handlerPath}.${extensions[i]}`;

            if (fs.existsSync(path.resolve('./', handler))) {
              handlerFileExists = true;
              break;
            }
          }

          // If Handler file does not exist, throw an error
          if (!handlerFileExists) {
            throw new Error('File does not exists');
          }
        } catch (error) {
          const message = `Handler file defined for function ${functionName} does not exist (${func.handler}, err : ${error} ).`;
          functionErrors.push(message);
        }

        // Check that triggers are valid
        func.events = func.events || [];
        functionErrors = [...functionErrors, ...this.validateTriggers(func.events)];
      });
    }

    if (this.serverless.service.custom) {
      // eslint-disable-next-line prefer-destructuring
      containers = this.serverless.service.custom.containers;
    }
    if (containers && Object.keys(containers).length !== 0) {
      containerNames = Object.keys(containers);

      // Validate triggers/events for containers
      containerNames.forEach((containerName) => {
        const container = containers[containerName];
        container.events = container.events || [];
        functionErrors = [...functionErrors, ...this.validateTriggers(container.events)];
      });
    }

    if (!functionNames.length && !containerNames.length) {
      functionErrors.push('You must define at least one function or container to deploy under the functions or custom key.');
    }

    return BbPromise.resolve(currentErrors.concat(functionErrors));
  },

  validateTriggers(triggers) {
    // Check that key schedule exists
    return triggers.reduce((accumulator, trigger) => {
      const triggerKeys = Object.keys(trigger);
      if (triggerKeys.length !== 1) {
        const errorMessage = 'Trigger is invalid, it should contain at least one event type configuration (example: schedule).';
        return [...accumulator, errorMessage];
      }

      // e.g schedule, http
      const triggerName = triggerKeys[0];

      const authorizedTriggers = Object.keys(TRIGGERS_VALIDATION);
      if (!authorizedTriggers.includes(triggerName)) {
        const errorMessage = `Trigger Type ${triggerName} is not currently supported by Scaleway's Serverless platform, supported types are the following: ${authorizedTriggers.join(', ')}`;
        return [...accumulator, errorMessage];
      }

      // Run Trigger validation
      try {
        TRIGGERS_VALIDATION[triggerName](trigger[triggerName]);
      } catch (error) {
        return [...accumulator, error.message];
      }

      return accumulator;
    }, []);
  },

  validateEnv(variables) {
    const errors = [];

    if (!variables) return errors;
    if (typeof variables !== 'object') {
      throw new Error('Environment variables should be a map of strings under the form: key - value');
    }

    const variableNames = Object.keys(variables);
    variableNames.forEach((variableName) => {
      const variable = variables[variableName];
      if (typeof variable !== 'string') {
        const error = `Variable ${variableName}: variable is invalid, environment variables may only be strings`;
        errors.push(error);
      }
    });

    return errors;
  },
};
