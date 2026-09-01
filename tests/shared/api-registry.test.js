"use strict";

const jestExpect = expect;

const RegistryApi = require("../../shared/api/registry");

// RegistryApi's constructor builds a real (lazily-resolved) SDK client, so
// these tests call the prototype methods directly with a fake `this`
// (`sdkApi` mocked) rather than constructing a real instance - the same
// pattern api-functions.test.js/api-containers.test.js/api-namespaces.test.js
// use for their plain-function equivalents.
const registryNamespace = {
  id: "ns-1",
  name: "my-registry",
  projectId: "proj-1",
};

describe("listRegistryNamespace field aliasing", () => {
  it("maps projectId to project_id for every namespace", async () => {
    const ctx = {
      sdkApi: {
        listNamespaces: () => ({
          all: () => Promise.resolve([registryNamespace]),
        }),
      },
    };

    const [result] = await RegistryApi.prototype.listRegistryNamespace.call(
      ctx,
      "proj-1",
    );

    jestExpect(result.project_id).toBe("proj-1");
  });
});

describe("deleteRegistryNamespace field aliasing", () => {
  it("maps projectId to project_id", async () => {
    const ctx = {
      sdkApi: {
        deleteNamespace: () => Promise.resolve(registryNamespace),
      },
    };

    const result = await RegistryApi.prototype.deleteRegistryNamespace.call(
      ctx,
      "ns-1",
    );

    jestExpect(result.project_id).toBe("proj-1");
  });
});

describe("createRegistryNamespace", () => {
  it("maps project_id to projectId in the request and back in the response", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createNamespace: (request) => {
          capturedRequest = request;
          return Promise.resolve({
            id: "ns-1",
            name: request.name,
            projectId: request.projectId,
          });
        },
      },
    };

    const result = await RegistryApi.prototype.createRegistryNamespace.call(
      ctx,
      { name: "my-registry", project_id: "proj-1" },
    );

    jestExpect(capturedRequest.projectId).toBe("proj-1");
    jestExpect(result.project_id).toBe("proj-1");
  });
});
