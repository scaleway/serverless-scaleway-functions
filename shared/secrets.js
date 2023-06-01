const argon2 = require("argon2");

module.exports = {
  // converts an object from serverless framework ({"a": "b", "c": "d"})
  // to an array of secrets expected by the API :
  // [{"key": "a", "value": "b"}, {"key": "c", "value": "d"}]
  convertObjectToModelSecretsArray(obj) {
    if (obj === {} || obj === null || obj === undefined) {
      return [];
    }
    return Object.keys(obj).map((k) => ({
      key: k,
      value: obj[k],
    }));
  },

  // resolves a value from a secret
  // if this is a raw value, return the value
  // if this is a reference to a local environment variable, return the value of that env var
  resolveSecretValue(key, value, logger) {
    const envVarRe = /^\${([^}]*)}$/;
    const found = value.match(envVarRe);

    if (!found) {
      return value;
    }

    if (found[1] in process.env) {
      return process.env[found[1]];
    }

    logger.log(
      `WARNING: Env var ${found[1]} used in secret ${key} does not exist: this secret will not be created`
    );
    return null;
  },

  // returns the secret env vars to send to the API
  // it is computed by making the difference between existing secrets and secrets sent via the framework
  // see unit tests for all use cases
  async mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars, logger) {
    const existingSecretEnvVarsByKey = new Map(
      existingSecretEnvVars.map((i) => [i.key, i.hashed_value])
    );
    const newSecretEnvVarsByKey = new Map(
      newSecretEnvVars.map((i) => [
        i.key,
        this.resolveSecretValue(i.key, i.value, logger),
      ])
    );

    const result = [];

    for (const [key, hashedValue] of existingSecretEnvVarsByKey) {
      if (
        newSecretEnvVarsByKey.get(key) === undefined ||
        newSecretEnvVarsByKey.get(key) === null
      ) {
        // secret is removed
        result.push({ key, value: null });
      } else {
        // exists in both
        const hashMatches = await argon2.verify(
          hashedValue,
          newSecretEnvVarsByKey.get(key)
        );

        if (!hashMatches) {
          // secret has changed
          result.push({ key, value: newSecretEnvVarsByKey.get(key) });
        }

        newSecretEnvVarsByKey.delete(key);
      }
    }

    // new secrets
    newSecretEnvVarsByKey.forEach((value, key) => {
      result.push({ key, value });
    });

    return result;
  },
};
