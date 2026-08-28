"use strict";

const jestExpect = expect;

const RegistryApi = require("../../shared/api/registry");

describe("RegistryApi.listRegistryNamespace", () => {
  it("filters by the API's actual project_id query param, not projectId", async () => {
    const registryApi = new RegistryApi("https://registry.example.test", "t");
    let requestedUrl;
    registryApi.apiManager.get = (url) => {
      requestedUrl = url;
      return Promise.resolve({ data: { namespaces: [] } });
    };

    await registryApi.listRegistryNamespace("project-1");

    jestExpect(requestedUrl).toBe("namespaces?project_id=project-1");
  });

  it("resolves with the namespaces from the response", async () => {
    const registryApi = new RegistryApi("https://registry.example.test", "t");
    const namespaces = [{ id: "ns-1" }];
    registryApi.apiManager.get = () =>
      Promise.resolve({ data: { namespaces } });

    const result = await registryApi.listRegistryNamespace("project-1");

    jestExpect(result).toBe(namespaces);
  });
});
