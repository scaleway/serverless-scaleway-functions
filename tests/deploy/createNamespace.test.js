"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const createNamespace = require("../../deploy/lib/createNamespace");

describe("createIfNotExists", () => {
  it("throws and saves the namespace when it exists but is in error status", () => {
    const ctx = {
      ...createNamespace,
      namespaceName: "my-service",
      serverless: { cli: { log: () => {} } },
    };
    const foundNamespace = { status: "error", error_message: "boom" };

    jestExpect(() =>
      createNamespace.createIfNotExists.call(ctx, foundNamespace),
    ).toThrow("boom");
    jestExpect(ctx.namespace).toBe(foundNamespace);
  });

  // NOTE: the "exists but not yet ready" branch (foundNamespace.status is
  // neither "error" nor "ready") is NOT covered here. While writing this
  // test we found that branch calls this.waitNamespaceIsReadyAndSave()
  // without first calling this.saveNamespaceToProvider(foundNamespace), so
  // waitNamespaceIsReadyAndSave's `this.namespace.id` read throws a
  // TypeError instead of actually waiting. This looks like a real,
  // pre-existing bug (not part of the tracked findings) - flagged in the
  // test-coverage report rather than fixed here per task scope.

  it("saves the namespace and resolves immediately when it already exists and is ready", async () => {
    const ctx = {
      ...createNamespace,
      namespaceName: "my-service",
      serverless: { cli: { log: () => {} } },
      createNamespace: jest.fn(),
      waitNamespaceIsReady: jest.fn(),
    };
    const foundNamespace = { status: "ready", id: "ns-1" };

    await createNamespace.createIfNotExists.call(ctx, foundNamespace);

    jestExpect(ctx.namespace).toBe(foundNamespace);
    jestExpect(ctx.createNamespace).not.toHaveBeenCalled();
    jestExpect(ctx.waitNamespaceIsReady).not.toHaveBeenCalled();
  });

  it("logs and attempts to wait for readiness (rather than re-creating) when the namespace exists but isn't ready yet", async () => {
    // Doesn't assert full success (see the bug noted above) - just that the
    // "already exists, not ready" branch is entered and does NOT try to
    // create a duplicate namespace.
    const ctx = {
      ...createNamespace,
      namespaceName: "my-service",
      serverless: { cli: { log: () => {} } },
      createNamespace: jest.fn(),
      waitNamespaceIsReady: jest.fn(() =>
        Promise.resolve({ id: "ns-1", status: "ready" }),
      ),
    };
    const foundNamespace = { status: "pending", id: "ns-1" };

    // Throws synchronously (this.namespace.id is read before any promise is
    // returned) rather than rejecting - part of the same bug.
    jestExpect(() =>
      createNamespace.createIfNotExists.call(ctx, foundNamespace),
    ).toThrow(/Cannot read properties of undefined/);

    jestExpect(ctx.createNamespace).not.toHaveBeenCalled();
  });

  it("creates a new namespace and waits for it to become ready when none was found", async () => {
    const createdParams = [];
    const ctx = {
      ...createNamespace,
      namespaceName: "my-service",
      serverless: { cli: { log: () => {} } },
      provider: { getScwProject: () => "project-1" },
      namespaceVariables: { FOO: "bar" },
      namespaceSecretVariables: undefined,
      createNamespace: (params) => {
        createdParams.push(params);
        return Promise.resolve({ id: "ns-new", status: "pending" });
      },
      waitNamespaceIsReady: jest.fn(() =>
        Promise.resolve({ id: "ns-new", status: "ready" }),
      ),
    };

    await createNamespace.createIfNotExists.call(ctx, undefined);

    jestExpect(createdParams).toEqual([
      {
        name: "my-service",
        project_id: "project-1",
        environment_variables: { FOO: "bar" },
        secret_environment_variables: [],
      },
    ]);
    jestExpect(ctx.waitNamespaceIsReady).toHaveBeenCalledWith("ns-new");
    jestExpect(ctx.namespace).toEqual({ id: "ns-new", status: "ready" });
  });

  it("propagates a create failure instead of swallowing it", async () => {
    const ctx = {
      namespaceName: "my-service",
      serverless: { cli: { log: () => {} } },
      provider: { getScwProject: () => "project-1" },
      createNamespace: () => Promise.reject(new Error("create failed")),
    };

    await jestExpect(
      createNamespace.createIfNotExists.call(ctx, undefined),
    ).rejects.toThrow("create failed");
  });
});

describe("updateNamespaceConfiguration", () => {
  it("does nothing when neither env vars nor secrets are configured", async () => {
    const ctx = {
      namespaceVariables: undefined,
      namespaceSecretVariables: undefined,
      updateNamespace: jest.fn(),
    };

    const result = await createNamespace.updateNamespaceConfiguration.call(ctx);

    jestExpect(result).toBeUndefined();
    jestExpect(ctx.updateNamespace).not.toHaveBeenCalled();
  });

  it("only includes environment_variables in the update payload when only env vars changed", async () => {
    let capturedParams;
    const ctx = {
      namespaceVariables: { FOO: "bar" },
      namespaceSecretVariables: undefined,
      namespace: { id: "ns-1" },
      updateNamespace: (id, params) => {
        capturedParams = params;
        return Promise.resolve();
      },
    };

    await createNamespace.updateNamespaceConfiguration.call(ctx);

    jestExpect(capturedParams).toEqual({
      environment_variables: { FOO: "bar" },
    });
  });

  it("merges secret env vars against the namespace's existing secrets when secrets changed", async () => {
    let capturedParams;
    const ctx = {
      namespaceVariables: undefined,
      namespaceSecretVariables: { TOKEN: "shh" },
      serverless: { cli: { log: () => {} } },
      namespace: {
        id: "ns-1",
        secret_environment_variables: [{ key: "OLD", hashed_value: "h" }],
      },
      updateNamespace: (id, params) => {
        capturedParams = params;
        return Promise.resolve();
      },
    };

    await createNamespace.updateNamespaceConfiguration.call(ctx);

    jestExpect(capturedParams.environment_variables).toBeUndefined();
    jestExpect(
      capturedParams.secret_environment_variables.some(
        (s) => s.key === "TOKEN",
      ),
    ).toBe(true);
  });
});

describe("createServerlessNamespace (full orchestration)", () => {
  it("looks up the namespace by name/project and passes it to createIfNotExists", async () => {
    const ctx = {
      ...createNamespace,
      namespaceName: "my-service",
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: () => {} } },
      getNamespaceFromList: (name, projectId) => {
        jestExpect(name).toEqual("my-service");
        jestExpect(projectId).toEqual("project-1");
        return Promise.resolve({ id: "ns-1", status: "ready" });
      },
    };

    await createNamespace.createServerlessNamespace.call(ctx);

    jestExpect(ctx.namespace).toEqual({ id: "ns-1", status: "ready" });
  });

  it("propagates a lookup failure instead of swallowing it", async () => {
    const ctx = {
      ...createNamespace,
      namespaceName: "my-service",
      provider: { getScwProject: () => "project-1" },
      getNamespaceFromList: () => Promise.reject(new Error("lookup failed")),
    };

    await jestExpect(
      createNamespace.createServerlessNamespace.call(ctx),
    ).rejects.toThrow("lookup failed");
  });
});
