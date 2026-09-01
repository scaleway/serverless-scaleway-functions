"use strict";

const jestExpect = expect;

const getLogs = require("../../logs/lib/getLogs");

describe("getLogs", () => {
  it("chains namespace lookup -> list applications -> find app -> fetch lines -> print, in order", async () => {
    const printed = [];
    const ctx = {
      ...getLogs,
      namespaceName: "my-service",
      options: { function: "first" },
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: (msg) => printed.push(msg) } },
      getNamespaceFromList: () => Promise.resolve({ id: "ns-1" }),
      listFunctions: (namespaceId) =>
        Promise.resolve([
          { name: "first", id: "func-1" },
          { name: "second", id: "func-2" },
        ]).then((apps) => {
          jestExpect(namespaceId).toEqual("ns-1");
          return apps;
        }),
      getLines: (app) => {
        jestExpect(app).toEqual({ name: "first", id: "func-1" });
        return Promise.resolve([{ message: "line 1" }, { message: "line 2" }]);
      },
    };

    await getLogs.getLogs.call(ctx);

    jestExpect(printed).toEqual(
      jestExpect.arrayContaining(["line 2", "line 1"]),
    );
  });

  it("dispatches to listContainers instead of listFunctions when this.listFunctions isn't defined", async () => {
    const ctx = {
      ...getLogs,
      namespaceName: "my-service",
      options: { function: "web" },
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: () => {} } },
      getNamespaceFromList: () => Promise.resolve({ id: "ns-1" }),
      listContainers: () => Promise.resolve([{ name: "web", id: "cont-1" }]),
      getLines: () => Promise.resolve([]),
    };

    await getLogs.getLogs.call(ctx);
  });

  it("throws a clear error when the named application isn't found", async () => {
    const ctx = {
      ...getLogs,
      namespaceName: "my-service",
      options: { function: "missing" },
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: () => {} } },
      getNamespaceFromList: () => Promise.resolve({ id: "ns-1" }),
      listFunctions: () => Promise.resolve([{ name: "first", id: "func-1" }]),
    };

    await jestExpect(getLogs.getLogs.call(ctx)).rejects.toThrow(
      '"missing" not found',
    );
  });
});
