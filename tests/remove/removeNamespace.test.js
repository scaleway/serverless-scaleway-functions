"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const removeNamespace = require("../../remove/lib/removeNamespace");

describe("removeSingleNamespace", () => {
  it("throws a clear error instead of crashing when no matching namespace was found", () => {
    const ctx = {
      namespaceName: "my-service",
    };

    jestExpect(() =>
      removeNamespace.removeSingleNamespace.call(ctx, undefined),
    ).toThrow(
      "Unable to remove namespace and functions: No namespace found with name my-service",
    );
  });

  it("waits for the delete to actually complete before waiting for deletion status, and logs only after both finish", async () => {
    const logs = [];
    let deleteResolve;
    let waitResolve;
    let waitCalled = false;

    const ctx = {
      serverless: { cli: { log: (msg) => logs.push(msg) } },
      deleteNamespace: () =>
        new Promise((resolve) => {
          deleteResolve = resolve;
        }),
      waitNamespaceIsDeleted: () => {
        waitCalled = true;
        return new Promise((resolve) => {
          waitResolve = resolve;
        });
      },
    };

    const resultPromise = removeNamespace.removeSingleNamespace.call(ctx, {
      id: "ns-1",
      name: "my-service",
    });

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(waitCalled).toBe(false);

    deleteResolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(waitCalled).toBe(true);
    jestExpect(logs).toEqual([]);

    waitResolve();
    await resultPromise;

    jestExpect(logs).toEqual(["Namespace has been deleted successfully"]);
  });

  it("propagates a delete failure instead of swallowing it", async () => {
    const ctx = {
      serverless: { cli: { log: () => {} } },
      deleteNamespace: () => Promise.reject(new Error("delete failed")),
      waitNamespaceIsDeleted: () => Promise.resolve(true),
    };

    await jestExpect(
      removeNamespace.removeSingleNamespace.call(ctx, { id: "ns-1" }),
    ).rejects.toThrow("delete failed");
  });
});

describe("removeNamespace (full orchestration)", () => {
  it("looks up the namespace by name/project and passes it to removeSingleNamespace", async () => {
    const logs = [];
    const ctx = {
      ...removeNamespace,
      namespaceName: "my-service",
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: (msg) => logs.push(msg) } },
      getNamespaceFromList: (name, projectId) => {
        jestExpect(name).toEqual("my-service");
        jestExpect(projectId).toEqual("project-1");
        return Promise.resolve({ id: "ns-1", name: "my-service" });
      },
      deleteNamespace: () => Promise.resolve(),
      waitNamespaceIsDeleted: () => Promise.resolve(true),
    };

    await removeNamespace.removeNamespace.call(ctx);

    jestExpect(logs).toEqual([
      "Removing namespace and associated functions/triggers...",
      "Namespace has been deleted successfully",
    ]);
  });

  it("propagates the not-found error when no namespace matches", async () => {
    const ctx = {
      ...removeNamespace,
      namespaceName: "my-service",
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: () => {} } },
      getNamespaceFromList: () => Promise.resolve(undefined),
    };

    await jestExpect(removeNamespace.removeNamespace.call(ctx)).rejects.toThrow(
      "No namespace found with name my-service",
    );
  });
});
