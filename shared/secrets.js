const argon2 = require('argon2');

module.exports = {
  convertObjectToModelSecretsArray(obj) {
    if (obj === {} || obj === null || obj === undefined) {
      return [];
    }
    return Object.keys(obj)
      .map(k => ({
        key: k,
        value: obj[k],
      }));
  },

  resolveSecretValue(key, value) {
    const re = /^\${([^}]*)}$/;
    const found = value.match(re);

    if (!found) {
      return value;
    }

    if (process.env[found[1]] === null || process.env[found[1]] === undefined) {
      console.warn(`Env var ${found[1]} used in secret ${key} does not exist: this secret will not be created.`);
    }

    return process.env[found[1]];
  },

  async mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars) {
    const existingSecretEnvVarsByKey = new Map(existingSecretEnvVars.map(
      i => [i.key, i.hashed_value],
    ));
    const newSecretEnvVarsByKey = new Map(newSecretEnvVars.map(
      i => [i.key, this.resolveSecretValue(i.key, i.value)],
    ));

    const result = [];

    for (const [key, hashedValue] of existingSecretEnvVarsByKey) {
      if (newSecretEnvVarsByKey.get(key) === undefined || newSecretEnvVarsByKey.get(key) === null) {
        // secret is removed
        result.push({ key, value: null });
      } else { // exists in both
        const hashMatches = await argon2.verify(hashedValue, newSecretEnvVarsByKey.get(key));

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
