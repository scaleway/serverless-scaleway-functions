"use strict";

const jestExpect = expect;

const functionsApi = require("../../shared/api/functions");

// Regression coverage for the field-aliasing contract toLegacyFunction()
// maintains between the SDK's real camelCase response shape and the
// snake_case field names production/test code has always read
// (deploy/lib/deployFunctions.ts's domain_name/runtime_message,
// deploy/lib/createFunctions.ts's private_network_id/
// secret_environment_variables, tests/functions/functions.test.js's
// http_option) - two of these (http_option, and containers.ts's matching
// registry_image) were missing entirely until a live serverless deploy
// caught it; the API layer's own smoke tests never exercised assertions
// on those specific fields.
const sdkFunction = {
  id: "func-1",
  name: "my-func",
  status: "ready",
  errorMessage: "boom",
  domainName: "my-func.functions.fnc.fr-par.scw.cloud",
  runtimeMessage: "node22 is fine",
  privateNetworkId: "pn-1",
  httpOption: "redirected",
  secretEnvironmentVariables: [{ key: "SECRET", hashedValue: "abc123" }],
};

describe("listFunctions field aliasing", () => {
  it("maps every camelCase SDK field to its legacy snake_case name", async () => {
    const ctx = {
      sdkApi: {
        listFunctions: () => ({ all: () => Promise.resolve([sdkFunction]) }),
      },
    };

    const [result] = await functionsApi.listFunctions.call(ctx, "ns-1");

    jestExpect(result.error_message).toBe("boom");
    jestExpect(result.domain_name).toBe(
      "my-func.functions.fnc.fr-par.scw.cloud",
    );
    jestExpect(result.runtime_message).toBe("node22 is fine");
    jestExpect(result.private_network_id).toBe("pn-1");
    jestExpect(result.http_option).toBe("redirected");
    jestExpect(result.secret_environment_variables).toEqual([
      { key: "SECRET", hashed_value: "abc123" },
    ]);
  });
});

describe("getFunction field aliasing", () => {
  it("maps every camelCase SDK field to its legacy snake_case name", async () => {
    const ctx = {
      sdkApi: {
        getFunction: () => Promise.resolve(sdkFunction),
      },
    };

    const result = await functionsApi.getFunction.call(ctx, "func-1");

    jestExpect(result.http_option).toBe("redirected");
    jestExpect(result.domain_name).toBe(
      "my-func.functions.fnc.fr-par.scw.cloud",
    );
  });
});
