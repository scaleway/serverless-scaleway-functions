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
  publicEndpoint: "my-container.functions.fnc.fr-par.scw.cloud",
  privateNetworkId: "pn-1",
  httpsConnectionsOnly: true,
  image: "rg.fr-par.scw.cloud/ns/my-image:latest",
  secretEnvironmentVariables: { SECRET: "abc123" },
  mvcpuLimit: 140,
  memoryLimitBytes: 268435456,
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
    jestExpect(result.memory_limit).toBe(256);
    jestExpect(result.cpu_limit).toBe(140);
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

  it("leaves http_option undefined rather than defaulting it, when the SDK didn't set httpsConnectionsOnly", async () => {
    const ctx = {
      sdkApi: {
        getContainer: () =>
          Promise.resolve({ id: "container-1", name: "web", status: "ready" }),
      },
    };

    const result = await containersApi.getContainer.call(ctx, "container-1");

    jestExpect(result.http_option).toBeUndefined();
  });
});

describe("createContainer request building", () => {
  it("converts memory_limit from MB to bytes, renames fields for v1, and drops maxConcurrency", async () => {
    let sentRequest;
    const ctx = {
      sdkApi: {
        createContainer: (request) => {
          sentRequest = request;
          return Promise.resolve(sdkContainer);
        },
      },
    };

    await containersApi.createContainer.call(ctx, {
      name: "web",
      namespace_id: "ns-1",
      memory_limit: 256,
      cpu_limit: 140,
      registry_image: "rg.fr-par.scw.cloud/ns/web:latest",
      max_concurrency: 50,
      http_option: "redirected",
      health_check: {
        failure_threshold: 3,
        interval: "10s",
        http: { path: "/" },
      },
    });

    jestExpect(sentRequest.memoryLimitBytes).toBe(256 * 1024 * 1024);
    jestExpect(sentRequest.mvcpuLimit).toBe(140);
    jestExpect(sentRequest.image).toBe("rg.fr-par.scw.cloud/ns/web:latest");
    jestExpect(sentRequest.httpsConnectionsOnly).toBe(true);
    jestExpect(sentRequest.startupProbe).toEqual({
      failureThreshold: 3,
      interval: "10s",
      // Required by the live v1 API even though the SDK's own type marks
      // it optional (confirmed 2026-08-27) - there's no serverless.yml
      // surface for it, so this must always be a fixed default.
      timeout: "1s",
      http: { path: "/" },
      tcp: undefined,
    });
    // v1 has no maxConcurrency field at all - forwarding it would be a
    // silently-ignored (or rejected) field, so it must never be sent.
    jestExpect(sentRequest.maxConcurrency).toBeUndefined();
    jestExpect("maxConcurrency" in sentRequest).toBe(false);
  });

  it("leaves memoryLimitBytes undefined when no memory_limit is configured", async () => {
    let sentRequest;
    const ctx = {
      sdkApi: {
        createContainer: (request) => {
          sentRequest = request;
          return Promise.resolve(sdkContainer);
        },
      },
    };

    await containersApi.createContainer.call(ctx, { name: "web" });

    jestExpect(sentRequest.memoryLimitBytes).toBeUndefined();
  });

  // v1's CreateContainerRequest/UpdateContainerRequest take
  // secretEnvironmentVariables as a plain Record<string,string> on the wire
  // (confirmed against the real generated marshaller, which does zero shape
  // translation) - shared/secrets.ts always builds an array of
  // {key, value} (create) or {key, value: string|null} (update, null =
  // removed), matching the *old* v1beta1 shape, so it must be converted here.
  it("converts the {key,value}[] secret array shared/secrets.ts builds into a Record<string,string>", async () => {
    let sentRequest;
    const ctx = {
      sdkApi: {
        createContainer: (request) => {
          sentRequest = request;
          return Promise.resolve(sdkContainer);
        },
      },
    };

    await containersApi.createContainer.call(ctx, {
      name: "web",
      secret_environment_variables: [
        { key: "DB_PASSWORD", value: "s3cr3t" },
        { key: "API_KEY", value: "abc123" },
      ],
    });

    jestExpect(sentRequest.secretEnvironmentVariables).toEqual({
      DB_PASSWORD: "s3cr3t",
      API_KEY: "abc123",
    });
  });

  it("drops a null-valued (removed) secret entry rather than forwarding it", async () => {
    let sentRequest;
    const ctx = {
      sdkApi: {
        updateContainer: (request) => {
          sentRequest = request;
          return Promise.resolve(sdkContainer);
        },
      },
    };

    await containersApi.updateContainer.call(ctx, "container-1", {
      secret_environment_variables: [
        { key: "KEPT", value: "still-here" },
        { key: "REMOVED", value: null },
      ],
    });

    jestExpect(sentRequest.secretEnvironmentVariables).toEqual({
      KEPT: "still-here",
    });
  });

  it("leaves secretEnvironmentVariables undefined when no secrets are configured", async () => {
    let sentRequest;
    const ctx = {
      sdkApi: {
        createContainer: (request) => {
          sentRequest = request;
          return Promise.resolve(sdkContainer);
        },
      },
    };

    await containersApi.createContainer.call(ctx, { name: "web" });

    jestExpect(sentRequest.secretEnvironmentVariables).toBeUndefined();
  });
});
