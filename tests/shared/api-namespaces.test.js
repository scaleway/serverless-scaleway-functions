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
});
