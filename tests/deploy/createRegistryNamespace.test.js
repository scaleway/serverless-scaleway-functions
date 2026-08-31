"use strict";

const jestExpect = expect;

const createRegistryNamespace = require("../../deploy/lib/createRegistryNamespace");
const { needsRegistryNamespace, shortProjectSuffix, resolveRegistryNamespace } =
  createRegistryNamespace;
const { Errors } = require("@scaleway/sdk-client");

// createRegistryNamespaceWithRetry recurses via setTimeout(..., 5000) while
// retrying a 403 - fake timers let us drive that deterministically instead
// of a test actually waiting up to a minute.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function permissionsError() {
  return new Errors.ScalewayError(
    403,
    "insufficient permissions",
    "insufficient permissions: write api_admin_namespace",
  );
}

describe("needsRegistryNamespace", () => {
  it("is false when there are no containers at all", () => {
    jestExpect(needsRegistryNamespace(undefined)).toBe(false);
  });

  it("is false when every container brings its own external image and isn't built locally", () => {
    jestExpect(
      needsRegistryNamespace({
        web: { registryImage: "nginx:latest" },
      }),
    ).toBe(false);
  });

  it("is true when a container has no registryImage configured", () => {
    jestExpect(needsRegistryNamespace({ web: {} })).toBe(true);
  });

  it("is true when a container is built from a local directory, even with a registryImage set", () => {
    jestExpect(
      needsRegistryNamespace({
        web: { directory: "./web", registryImage: "nginx:latest" },
      }),
    ).toBe(true);
  });
});

describe("shortProjectSuffix", () => {
  it("is deterministic and strips hyphens", () => {
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    jestExpect(shortProjectSuffix(projectId)).toBe("aaaaaaaa");
    jestExpect(shortProjectSuffix(projectId)).toBe(
      shortProjectSuffix(projectId),
    );
  });
});

describe("resolveRegistryNamespace", () => {
  it("reuses an existing namespace found under the primary name", async () => {
    const existing = { id: "reg-1", name: "my-service", endpoint: "ep-1" };
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([existing]),
      createRegistryNamespace: jest.fn(),
    };

    const result = await resolveRegistryNamespace(
      registryApi,
      "proj-1",
      "my-service",
      () => {},
    );

    jestExpect(result).toBe(existing);
    jestExpect(registryApi.createRegistryNamespace).not.toHaveBeenCalled();
  });

  it("reuses an existing namespace found only under the project-suffixed fallback name", async () => {
    const fallback = {
      id: "reg-1",
      name: "my-service-proj1234",
      endpoint: "ep-1",
    };
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([fallback]),
      createRegistryNamespace: jest.fn(),
    };

    const result = await resolveRegistryNamespace(
      registryApi,
      "proj1234",
      "my-service",
      () => {},
    );

    jestExpect(result).toBe(fallback);
    jestExpect(registryApi.createRegistryNamespace).not.toHaveBeenCalled();
  });

  it("creates a namespace under the primary name when none exists yet", async () => {
    const created = { id: "reg-2", name: "my-service", endpoint: "ep-2" };
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([]),
      createRegistryNamespace: jest.fn().mockResolvedValue(created),
    };

    const result = await resolveRegistryNamespace(
      registryApi,
      "proj-1",
      "my-service",
      () => {},
    );

    jestExpect(result).toBe(created);
    jestExpect(registryApi.createRegistryNamespace).toHaveBeenCalledWith({
      name: "my-service",
      project_id: "proj-1",
    });
  });

  it("falls back to the project-suffixed name when creating under the primary name is rejected", async () => {
    const created = {
      id: "reg-3",
      name: "my-service-proj1234",
      endpoint: "ep-3",
    };
    const conflictError = new Errors.ScalewayError(
      409,
      "name already taken",
      "name already taken",
    );
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([]),
      createRegistryNamespace: jest
        .fn()
        .mockRejectedValueOnce(conflictError)
        .mockResolvedValueOnce(created),
    };

    const result = await resolveRegistryNamespace(
      registryApi,
      "proj1234",
      "my-service",
      () => {},
    );

    jestExpect(result).toBe(created);
    jestExpect(registryApi.createRegistryNamespace).toHaveBeenNthCalledWith(1, {
      name: "my-service",
      project_id: "proj1234",
    });
    jestExpect(registryApi.createRegistryNamespace).toHaveBeenNthCalledWith(2, {
      name: "my-service-proj1234",
      project_id: "proj1234",
    });
  });

  it("propagates an error that isn't a ScalewayError instead of retrying", async () => {
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([]),
      createRegistryNamespace: jest
        .fn()
        .mockRejectedValue(new TypeError("network down")),
    };

    await jestExpect(
      resolveRegistryNamespace(registryApi, "proj-1", "my-service", () => {}),
    ).rejects.toThrow("network down");
    jestExpect(registryApi.createRegistryNamespace).toHaveBeenCalledTimes(1);
  });

  // Originally assumed to be IAM propagation lag on a brand-new project;
  // verified live (2026-08-28) that's wrong - once the credentials' IAM
  // policy actually grants Registry access, creation succeeds on the very
  // first attempt with no settle time at all. A 403 here means the policy
  // doesn't cover this project (e.g. it's scoped to a fixed list of
  // pre-existing projects, not "all projects, current and future"), which
  // retrying cannot fix - this short retry is only cheap insurance against
  // a genuinely transient error, retried with the *same* name (unlike the
  // 409 case above, which tries a different name).
  it("retries a 403 with the same name and succeeds once the transient denial clears", async () => {
    const created = { id: "reg-4", name: "my-service", endpoint: "ep-4" };
    const createRegistryNamespace = jest
      .fn()
      .mockRejectedValueOnce(permissionsError())
      .mockRejectedValueOnce(permissionsError())
      .mockResolvedValueOnce(created);
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([]),
      createRegistryNamespace,
    };

    const resultPromise = resolveRegistryNamespace(
      registryApi,
      "proj-1",
      "my-service",
      () => {},
    );
    await jest.advanceTimersByTimeAsync(15000);

    jestExpect(await resultPromise).toBe(created);
    jestExpect(createRegistryNamespace).toHaveBeenCalledTimes(3);
    jestExpect(createRegistryNamespace).toHaveBeenNthCalledWith(1, {
      name: "my-service",
      project_id: "proj-1",
    });
    jestExpect(createRegistryNamespace).toHaveBeenNthCalledWith(3, {
      name: "my-service",
      project_id: "proj-1",
    });
  });

  it("gives up and propagates the 403 once retries are exhausted", async () => {
    const createRegistryNamespace = jest
      .fn()
      .mockRejectedValue(permissionsError());
    const registryApi = {
      listRegistryNamespace: jest.fn().mockResolvedValue([]),
      createRegistryNamespace,
    };

    const resultPromise = resolveRegistryNamespace(
      registryApi,
      "proj-1",
      "my-service",
      () => {},
    );
    // Swallow the eventual rejection so it doesn't surface as an unhandled
    // rejection while the timers below are still being driven forward.
    const assertion = jestExpect(resultPromise).rejects.toThrow(
      "insufficient permissions",
    );
    await jest.advanceTimersByTimeAsync(15000);
    await assertion;

    // 3 total attempts: the original call plus 2 retries.
    jestExpect(createRegistryNamespace).toHaveBeenCalledTimes(3);
  });
});

describe("ensureRegistryNamespace", () => {
  it("does nothing and leaves registry_endpoint untouched when no container needs one", async () => {
    const ctx = {
      namespaceName: "my-service",
      namespace: {},
      provider: {
        serverless: {
          service: {
            custom: { containers: { web: { registryImage: "nginx:latest" } } },
          },
        },
      },
      serverless: { cli: { log: () => {} } },
    };

    await createRegistryNamespace.ensureRegistryNamespace.call(ctx);

    jestExpect(ctx.namespace.registry_endpoint).toBeUndefined();
  });
});
