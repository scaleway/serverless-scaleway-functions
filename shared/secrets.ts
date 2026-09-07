import argon2 from "argon2";

interface SecretModel {
  key: string;
  value: string | null;
}

interface ExistingSecretEnvVar {
  key: string;
  hashed_value: string;
}

interface NewSecretEnvVar {
  key: string;
  value: string;
}

interface Logger {
  log(message: string): void;
}

// This module's methods used to be a single object literal typed via
// `satisfies SecretsApi`, which contextually inferred each method's
// parameter types from the interface. Standalone named exports (needed to
// drop `export =`, itself needed for Bun compatibility - see the comment
// at the top of index.ts) lose that contextual inference, so parameters
// are now typed explicitly instead. The `this: SecretsApi` parameters
// still work: every real call site invokes these as `secrets.foo(...)`
// (property access on the whole required module, never destructured),
// which sets `this` to that module object at the call site exactly the
// way it did when these were object-literal methods.
interface SecretsApi {
  convertObjectToModelSecretsArray(
    obj: Record<string, string> | null | undefined,
  ): NewSecretEnvVar[];
  resolveSecretValue(key: string, value: string, logger: Logger): string | null;
  mergeSecretEnvVars(
    existingSecretEnvVars: ExistingSecretEnvVar[],
    newSecretEnvVars: NewSecretEnvVar[],
    logger: Logger,
  ): Promise<SecretModel[]>;
}

// converts an object from serverless framework ({"a": "b", "c": "d"})
// to an array of secrets expected by the API :
// [{"key": "a", "value": "b"}, {"key": "c", "value": "d"}]
//
// Returns NewSecretEnvVar[] (value: string, never null), not the broader
// SecretModel[] (value: string | null) used elsewhere in this file for
// mergeSecretEnvVars's *output* (where a null value legitimately means "this
// secret was removed") - indexing a Record<string, string> can never
// produce null/undefined, so the wider type would have been inaccurate.
// Verified this distinction is real, not cosmetic: this file used to type
// this method as returning SecretModel[] via contextual inference from an
// object-literal `satisfies SecretsApi` check, which silently narrowed the
// *actual* inferred return type to match what the body really produces
// (masking the interface's over-wide declaration); converting to a
// standalone function with an explicit return type surfaced the mismatch
// as a real compile error at every call site that feeds this method's
// output into mergeSecretEnvVars's newSecretEnvVars parameter.
export function convertObjectToModelSecretsArray(
  this: SecretsApi,
  obj: Record<string, string> | null | undefined,
): NewSecretEnvVar[] {
  if (obj === null || obj === undefined) {
    return [];
  }
  return Object.keys(obj).map((k) => ({
    key: k,
    value: obj[k],
  }));
}

// resolves a value from a secret
// if this is a raw value, return the value
// if this is a reference to a local environment variable, return the value of that env var
export function resolveSecretValue(
  this: SecretsApi,
  key: string,
  value: string,
  logger: Logger,
): string | null {
  const envVarRe = /^\${([^}]*)}$/;
  const found = value.match(envVarRe);

  if (!found) {
    return value;
  }

  if (found[1] in process.env) {
    return process.env[found[1]] ?? null;
  }

  logger.log(
    `WARNING: Env var ${found[1]} used in secret ${key} does not exist: this secret will not be created`,
  );
  return null;
}

// returns the secret env vars to send to the API
// it is computed by making the difference between existing secrets and secrets sent via the framework
// see unit tests for all use cases
export async function mergeSecretEnvVars(
  this: SecretsApi,
  existingSecretEnvVars: ExistingSecretEnvVar[],
  newSecretEnvVars: NewSecretEnvVar[],
  logger: Logger,
): Promise<SecretModel[]> {
  const existingSecretEnvVarsByKey = new Map(
    existingSecretEnvVars.map((i) => [i.key, i.hashed_value]),
  );
  const newSecretEnvVarsByKey = new Map(
    newSecretEnvVars.map((i) => [
      i.key,
      this.resolveSecretValue(i.key, i.value, logger),
    ]),
  );

  const result: SecretModel[] = [];

  for (const [key, hashedValue] of existingSecretEnvVarsByKey) {
    const newValue = newSecretEnvVarsByKey.get(key);
    if (newValue === undefined || newValue === null) {
      // secret is removed
      result.push({ key, value: null });
    } else {
      // exists in both
      const hashMatches = await argon2.verify(hashedValue, newValue);

      if (!hashMatches) {
        // secret has changed
        result.push({ key, value: newValue });
      }

      newSecretEnvVarsByKey.delete(key);
    }
  }

  // new secrets
  newSecretEnvVarsByKey.forEach((value, key) => {
    result.push({ key, value });
  });

  return result;
}
