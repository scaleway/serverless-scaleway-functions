"use strict";

const jestExpect = expect;

const containersApi = require("../../shared/api/containers");

// Regression coverage for toLegacyContainer()'s field-aliasing contract -
// see the identical comment in api-functions.test.js. registry_image in
// particular was missing entirely until a live serverless deploy caught
// it (tests/containers/containers.test.js reads it directly off a
// returned container to verify the deployed image).
const sdkContainer = {
  id: "container-1",
  name: "my-container",
  status: "ready",
  errorMessage: "boom",
  domainName: "my-container.functions.fnc.fr-par.scw.cloud",
  privateNetworkId: "pn-1",
  httpOption: "redirected",
  registryImage: "rg.fr-par.scw.cloud/ns/my-image:latest",
  secretEnvironmentVariables: [{ key: "SECRET", hashedValue: "abc123" }],
};

describe("listContainers field aliasing", () => {
  it("maps every camelCase SDK field to its legacy snake_case name", async () => {
    const ctx = {
      sdkApi: {
        listContainers: () => ({
          all: () => Promise.resolve([sdkContainer]),
        }),
      },
    };

    const [result] = await containersApi.listContainers.call(ctx, "ns-1");

    jestExpect(result.error_message).toBe("boom");
    jestExpect(result.domain_name).toBe(
      "my-container.functions.fnc.fr-par.scw.cloud",
    );
    jestExpect(result.private_network_id).toBe("pn-1");
    jestExpect(result.http_option).toBe("redirected");
    jestExpect(result.registry_image).toBe(
      "rg.fr-par.scw.cloud/ns/my-image:latest",
    );
    jestExpect(result.secret_environment_variables).toEqual([
      { key: "SECRET", hashed_value: "abc123" },
    ]);
  });
});

describe("getContainer field aliasing", () => {
  it("maps every camelCase SDK field to its legacy snake_case name", async () => {
    const ctx = {
      sdkApi: {
        getContainer: () => Promise.resolve(sdkContainer),
      },
    };

    const result = await containersApi.getContainer.call(ctx, "container-1");

    jestExpect(result.registry_image).toBe(
      "rg.fr-par.scw.cloud/ns/my-image:latest",
    );
    jestExpect(result.http_option).toBe("redirected");
  });
});
