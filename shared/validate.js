'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const path = require('path');

module.exports = {
  validate() {
    return BbPromise.bind(this)
      .then(this.validateServicePath)
      .then(this.validateCredentials)
      .then(this.validateNamespace)
      .then(this.validateFunctions)
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

  validateFunctions(errors) {
    const currentErrors = Array.isArray(errors) ? errors : [];
    const functions = this.serverless.service.functions;
    const functionNames = Object.keys(functions);
    let functionErrors = [];

    if (!functionNames.length) {
      functionErrors.push('You must define at least one function to deploy under the functions: key.');
    }

    functionNames.forEach((functionName) => {
      const func = functions[functionName];

      // Check function env vars
      functionErrors = functionErrors.concat(this.validateEnv(func.env));

      // Check if function handler exists
      try {
        if (!fs.existsSync(path.resolve('./', func.handler))) {
          throw new Error('File does not exists');
        }
      } catch (error) {
        const message = `Handler defined for function ${functionName} does not exist.`;
        functionErrors.push(message);
      }
    });

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
