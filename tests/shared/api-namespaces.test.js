"use strict";

const jestExpect = expect;

const namespacesApi = require("../../shared/api/namespaces");

function sdkListNamespaces(namespaces) {
  return { namespaces };
}

describe("getNamespaceFromList", () => {
  it("returns undefined instead of throwing when no namespace matches the name", async () => {
    const ctx = {
      sdkApi: {
        listNamespaces: () => sdkListNamespaces([]),
      },
    };

    await jestExpect(
      namespacesApi.getNamespaceFromList.call(ctx, "does-not-exist", "proj-1"),
    ).resolves.toBeUndefined();
  });

  it("returns the mapped namespace when one matches", async () => {
    const ctx = {
      sdkApi: {
        listNamespaces: () =>
          sdkListNamespaces([
            {
              id: "ns-1",
              name: "my-ns",
              status: "ready",
              errorMessage: undefined,
            },
          ]),
      },
    };

    const result = await namespacesApi.getNamespaceFromList.call(
      ctx,
      "my-ns",
      "proj-1",
    );

    jestExpect(result.id).toBe("ns-1");
    jestExpect(result.status).toBe("ready");
  });
});

describe("listNamespaces field aliasing", () => {
  it("maps every camelCase SDK field to its legacy snake_case name", async () => {
    const sdkNamespace = {
      id: "ns-1",
      name: "my-ns",
      status: "error",
      errorMessage: "boom",
      registryEndpoint: "rg.fr-par.scw.cloud/my-ns",
      secretEnvironmentVariables: [{ key: "SECRET", hashedValue: "abc123" }],
    };
    const ctx = {
      sdkApi: {
        listNamespaces: () => ({
          all: () => Promise.resolve([sdkNamespace]),
        }),
      },
    };

    const [result] = await namespacesApi.listNamespaces.call(ctx, "proj-1");

    jestExpect(result.error_message).toBe("boom");
    jestExpect(result.registry_endpoint).toBe("rg.fr-par.scw.cloud/my-ns");
    jestExpect(result.secret_environment_variables).toEqual([
      { key: "SECRET", hashed_value: "abc123" },
    ]);
  });

  // Containers moved to Containerv1, which returns secretEnvironmentVariables
  // as a plain Record<string,string> instead of v1beta1/Functions'
  // {key,hashedValue}[] - this file is shared between both products (see
  // the comment on SdkNamespace above), so both shapes need to keep mapping
  // to the same legacy array shape.
  it("maps a Record<string,string> secretEnvironmentVariables (Containerv1 shape) to the same legacy array shape", async () => {
    const sdkNamespace = {
      id: "ns-1",
      name: "my-ns",
      status: "ready",
      secretEnvironmentVariables: { SECRET: "abc123" },
    };
    const ctx = {
      sdkApi: {
        listNamespaces: () => ({
          all: () => Promise.resolve([sdkNamespace]),
        }),
      },
    };

    const [result] = await namespacesApi.listNamespaces.call(ctx, "proj-1");

    jestExpect(result.secret_environment_variables).toEqual([
      { key: "SECRET", hashed_value: "abc123" },
    ]);
  });
});

describe("createNamespace/updateNamespace secret shape, by product", () => {
  // FunctionApi sets secretEnvironmentVariablesShape = "array" (see
  // shared/api/index.ts) - Functionv1beta1 still wants the array shape
  // shared/secrets.ts builds, so it must be forwarded as-is.
  it("forwards the {key,value}[] array unchanged for the array shape (Functions)", async () => {
    let sentRequest;
    const ctx = {
      secretEnvironmentVariablesShape: "array",
      sdkApi: {
        createNamespace: (request) => {
          sentRequest = request;
          return Promise.resolve({
            id: "ns-1",
            name: "my-ns",
            status: "ready",
          });
        },
      },
    };

    await namespacesApi.createNamespace.call(ctx, {
      name: "my-ns",
      secret_environment_variables: [{ key: "SECRET", value: "abc123" }],
    });

    jestExpect(sentRequest.secretEnvironmentVariables).toEqual([
      { key: "SECRET", value: "abc123" },
    ]);
  });

  // ContainerApi sets secretEnvironmentVariablesShape = "record" (see
  // shared/api/index.ts) - Containerv1 wants a plain Record<string,string>
  // on the wire, with zero shape translation done by the SDK itself.
  it("converts the array into a Record<string,string> for the record shape (Containers)", async () => {
    let sentRequest;
    const ctx = {
      secretEnvironmentVariablesShape: "record",
      sdkApi: {
        createNamespace: (request) => {
          sentRequest = request;
          return Promise.resolve({
            id: "ns-1",
            name: "my-ns",
            status: "ready",
          });
        },
        updateNamespace: (request) => {
          sentRequest = request;
          return Promise.resolve({
            id: "ns-1",
            name: "my-ns",
            status: "ready",
          });
        },
      },
    };

    await namespacesApi.createNamespace.call(ctx, {
      name: "my-ns",
      secret_environment_variables: [{ key: "SECRET", value: "abc123" }],
    });
    jestExpect(sentRequest.secretEnvironmentVariables).toEqual({
      SECRET: "abc123",
    });

    await namespacesApi.updateNamespace.call(ctx, "ns-1", {
      secret_environment_variables: [
        { key: "KEPT", value: "still-here" },
        { key: "REMOVED", value: null },
      ],
    });
    jestExpect(sentRequest.secretEnvironmentVariables).toEqual({
      KEPT: "still-here",
    });
  });
});
