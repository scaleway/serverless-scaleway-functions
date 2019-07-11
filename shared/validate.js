'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const path = require('path');

const RUNTIMES_EXTENSIONS = {
  node8: ['ts', 'js'],
  node10: ['ts', 'js'],
  python: ['py'],
  python3: ['py'],
  golang: ['go'],
};

module.exports = {
  validate() {
    return BbPromise.bind(this)
      .then(this.validateServicePath)
      .then(this.validateCredentials)
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
    if (this.provider.scwToken.length !== 36 || this.provider.getScwOrganization().length !== 36) {
      const errorMessage = [
        'Either "scwToken" or "scwOrganization" is invalid.',
        ' Credentials to deploy on your Scaleway Account are required, please read the documentation.',
      ].join('');
      throw new Error(errorMessage);
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
    const functionErrors = [];
    let containers = [];

    const { functions } = this.serverless.service;
    if (functions && Object.keys(functions).length !== 0) {
      functionNames = Object.keys(functions);

      // Check that runtime is authorized
      const extensions = RUNTIMES_EXTENSIONS[this.runtime];
      if (!extensions) {
        const availableRuntimesMessage = Object.keys(RUNTIMES_EXTENSIONS).join(', ');
        functionErrors.push(`Runtime ${this.runtime} is not supported. Function runtime must be one of the following: ${availableRuntimesMessage}`);
      }

      functionNames.forEach((functionName) => {
        const func = functions[functionName];
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
            const extension = extensions[i];
            const handler = `${handlerPath}.${extension}`;
            if (fs.existsSync(path.resolve('./', handler))) {
              handlerFileExists = true;
            }
          }
          // If Handler file does not exist, throw an error
          if (!handlerFileExists) {
            throw new Error('File does not exists');
          }
        } catch (error) {
          const message = `Handler file defined for function ${functionName} does not exist (${func.handler}).`;
          functionErrors.push(message);
        }
      });
    }

    if (this.serverless.service.custom) {
      // eslint-disable-next-line prefer-destructuring
      containers = this.serverless.service.custom.containers;
    }
    if (containers && Object.keys(containers).length !== 0) {
      containerNames = Object.keys(containers);
    }

    if (!functionNames.length && !containerNames.length) {
      functionErrors.push('You must define at least one function or container to deploy under the functions or custom key.');
    }

    return BbPromise.resolve(currentErrors.concat(functionErrors));
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
