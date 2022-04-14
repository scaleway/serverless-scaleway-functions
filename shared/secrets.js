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

  async mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars) {
    const existingSecretEnvVarsByKey = new Map(existingSecretEnvVars.map(
      i => [i.key, i.hashed_value],
    ));
    const newSecretEnvVarsByKey = new Map(newSecretEnvVars.map(
      i => [i.key, i.value],
    ));

    const result = [];

    for (const [key, hashedValue] of existingSecretEnvVarsByKey) {
      if (newSecretEnvVarsByKey.get(key) === undefined || newSecretEnvVarsByKey.get(key) === null) {
        console.debug('Secret:', key, 'have been removed');
        result.push({ key, value: null });
      } else { // exists in both
        const hashMatches = await argon2.verify(hashedValue, newSecretEnvVarsByKey.get(key));

        if (!hashMatches) {
          console.debug('Secret: value of', key, 'has changed');
          result.push({ key, value: newSecretEnvVarsByKey.get(key) });
        }

        newSecretEnvVarsByKey.delete(key);
      }
    }

    newSecretEnvVarsByKey.forEach((value, key) => {
      console.debug('Secret:', key, 'is new');
      result.push({ key, value });
    });

    return result;
  },
};
