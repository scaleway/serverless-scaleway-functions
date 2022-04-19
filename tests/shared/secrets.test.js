const { expect } = require('chai');
const { expect: jestExpect } = require('@jest/globals');
const argon2 = require('argon2');
const secrets = require('../../shared/secrets');

describe('convertObjectToModelSecretsArray', () => {
  it('should transform an object to a secrets array as the API expects', () => {
    const actual = secrets.convertObjectToModelSecretsArray({
      env_secretA: 'valueA',
      env_secretB: 'valueB',
    });
    const expected = [
      { key: 'env_secretA', value: 'valueA' },
      { key: 'env_secretB', value: 'valueB' },
    ];
    expect(actual).to.eql(expected);
  });

  it('should transform an empty object to an empty array', () => {
    const actual = secrets.convertObjectToModelSecretsArray({});
    const expected = [];
    expect(actual).to.eql(expected);
  });
});

describe('resolveSecretValue', () => {
  const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

  beforeEach(() => consoleSpy.mockClear());

  it('should get a raw secret', () => {
    const actual = secrets.resolveSecretValue('env_secretA', 'valueA');
    const expected = 'valueA';
    expect(actual).to.eql(expected);
    jestExpect(console.warn).toHaveBeenCalledTimes(0);
  });

  it('should get a raw secret with special characters', () => {
    const actual = secrets.resolveSecretValue('env_secretA', 'value composed of special characters $^/;');
    const expected = 'value composed of special characters $^/;';
    expect(actual).to.eql(expected);
    jestExpect(console.warn).toHaveBeenCalledTimes(0);
  });

  it('should get a secret from an environment variable', () => {
    const OLD_ENV = process.env;
    process.env.ENV_SECRETA = 'valueA';

    const actual = secrets.resolveSecretValue('env_secretA', '${ENV_SECRETA}');
    process.env = OLD_ENV;

    const expected = process.env.ENV_SECRETA;
    expect(actual).to.eql(expected);
    jestExpect(console.warn).toHaveBeenCalledTimes(0);
  });

  it('should get a secret with empty value from an environment variable', () => {
    const OLD_ENV = process.env;
    process.env.ENV_SECRETA = '';

    const actual = secrets.resolveSecretValue('env_secretA', '${ENV_SECRETA}');
    process.env = OLD_ENV;

    const expected = process.env.ENV_SECRETA;
    expect(actual).to.eql(expected);
    jestExpect(console.warn).toHaveBeenCalledTimes(0);
  });

  it('should return null if environment variable does not exist', () => {
    delete process.env.ENV_SECRETA
    const actual = secrets.resolveSecretValue('env_secretA', '${ENV_SECRETA}');

    const expected = null;
    expect(actual).to.eql(expected);

    jestExpect(console.warn).toHaveBeenCalledTimes(1);
    jestExpect(console.warn).toHaveBeenLastCalledWith('WARNING: Env var ENV_SECRETA used in secret env_secretA does not exist: this secret will not be created');
  });
});

describe('mergeSecretEnvVars', () => {
  it('should add a secret env var', async () => {
    const existingSecretEnvVars = [];
    const newSecretEnvVars = [{ key: 'env_secretA', value: 'valueA' }];

    const actual = await secrets.mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars);
    const expected = [
      { key: 'env_secretA', value: 'valueA' },
    ];
    expect(actual).to.eql(expected);
  });

  it('should update a secret env var', async () => {
    const valueAHash = await argon2.hash('valueA', { type: argon2.argon2id });
    const existingSecretEnvVars = [{ key: 'env_secretA', hashed_value: valueAHash }];
    const newSecretEnvVars = [{ key: 'env_secretA', value: 'newValueA' }];

    const actual = await secrets.mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars);
    const expected = [
      { key: 'env_secretA', value: 'newValueA' },
    ];
    expect(actual).to.eql(expected);
  });

  it('should delete a secret env var', async () => {
    const valueAHash = await argon2.hash('valueA', { type: argon2.argon2id });
    const existingSecretEnvVars = [{ key: 'env_secretA', hashed_value: valueAHash }];
    const newSecretEnvVars = [];

    const actual = await secrets.mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars);
    const expected = [{ key: 'env_secretA', value: null }];
    expect(actual).to.eql(expected);
  });

  it('should add, update and delete secret env vars', async () => {
    const valueAHash = await argon2.hash('valueA', { type: argon2.argon2id });
    const valueBHash = await argon2.hash('valueB', { type: argon2.argon2id });
    const existingSecretEnvVars = [
      { key: 'env_secretA', hashed_value: valueAHash },
      { key: 'env_secretB', hashed_value: valueBHash },
    ];
    const newSecretEnvVars = [
      { key: 'env_secretA', value: 'newValueA' }, // update
      { key: 'env_secretC', value: 'valueC' }, // add
      // env_secretB is deleted
    ];

    const actual = await secrets.mergeSecretEnvVars(existingSecretEnvVars, newSecretEnvVars);
    const expected = [
      { key: 'env_secretA', value: 'newValueA' },
      { key: 'env_secretB', value: null },
      { key: 'env_secretC', value: 'valueC' },
    ];
    expect(actual).to.eql(expected);
  });
});
