"use strict";

const functionsApi = require("../../shared/api/functions");
const containersApi = require("../../shared/api/containers");
const namespacesApi = require("../../shared/api/namespaces");

// These wait* helpers recurse via setTimeout(..., N) until the resource
// reaches a final status. Fake timers let us drive that recursion
// deterministically instead of actually waiting seconds per test.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("waitForFunctionStatus", () => {
  it("resolves once the function reaches the wanted status", async () => {
    const ctx = { getFunction: () => Promise.resolve({ status: "ready" }) };

    const result = functionsApi.waitForFunctionStatus.call(
      ctx,
      "func-id",
      "ready",
    );

    await expect(result).resolves.toEqual({ status: "ready" });
  });

  it("throws when the function transitions to an error status", async () => {
    const ctx = {
      getFunction: () =>
        Promise.resolve({
          name: "my-func",
          status: "error",
          error_message: "boom",
        }),
    };

    await expect(
      functionsApi.waitForFunctionStatus.call(ctx, "func-id", "ready"),
    ).rejects.toThrow(/my-func.*boom/);
  });

  it("polls again after 5s and resolves once status catches up", async () => {
    let call = 0;
    const ctx = Object.assign({}, functionsApi, {
      getFunction: () => {
        call += 1;
        return Promise.resolve({
          status: call === 1 ? "pending" : "ready",
        });
      },
    });

    const resultPromise = functionsApi.waitForFunctionStatus.call(
      ctx,
      "func-id",
      "ready",
    );

    // Let the first getFunction() promise settle before advancing timers.
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({ status: "ready" });
    expect(call).toEqual(2);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, functionsApi, {
      getFunction: () => Promise.resolve({ status: "pending" }),
    });

    const resultPromise = functionsApi.waitForFunctionStatus.call(
      ctx,
      "func-id",
      "ready",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitFunctionsAreDeployed", () => {
  it("resolves once every function in the namespace is ready", async () => {
    const ctx = {
      listFunctions: () =>
        Promise.resolve([
          { name: "a", status: "ready" },
          { name: "b", status: "ready" },
        ]),
    };

    await expect(
      functionsApi.waitFunctionsAreDeployed.call(ctx, "ns-1"),
    ).resolves.toEqual([
      { name: "a", status: "ready" },
      { name: "b", status: "ready" },
    ]);
  });

  it("throws as soon as any function reports an error status, without waiting for the rest", async () => {
    const ctx = {
      listFunctions: () =>
        Promise.resolve([
          { name: "a", status: "error", error_message: "deploy failed" },
          { name: "b", status: "pending" },
        ]),
    };

    await expect(
      functionsApi.waitFunctionsAreDeployed.call(ctx, "ns-1"),
    ).rejects.toThrow("deploy failed");
  });

  it("polls again when at least one function isn't ready yet", async () => {
    let call = 0;
    const ctx = Object.assign({}, functionsApi, {
      listFunctions: () => {
        call += 1;
        return Promise.resolve([
          { name: "a", status: call === 1 ? "pending" : "ready" },
        ]);
      },
    });

    const resultPromise = functionsApi.waitFunctionsAreDeployed.call(
      ctx,
      "ns-1",
    );

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual([
      { name: "a", status: "ready" },
    ]);
    expect(call).toEqual(2);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, functionsApi, {
      listFunctions: () => Promise.resolve([{ name: "a", status: "pending" }]),
    });

    const resultPromise = functionsApi.waitFunctionsAreDeployed.call(
      ctx,
      "ns-1",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitDomainsAreDeployedFunction", () => {
  it("resolves once every domain is ready", async () => {
    const ctx = {
      listDomainsFunction: () =>
        Promise.resolve([{ hostname: "a.example.com", status: "ready" }]),
    };

    await expect(
      functionsApi.waitDomainsAreDeployedFunction.call(ctx, "func-1"),
    ).resolves.toEqual([{ hostname: "a.example.com", status: "ready" }]);
  });

  it("throws as soon as a domain reports an error status", async () => {
    const ctx = {
      listDomainsFunction: () =>
        Promise.resolve([
          {
            hostname: "a.example.com",
            status: "error",
            error_message: "could not validate",
          },
        ]),
    };

    await expect(
      functionsApi.waitDomainsAreDeployedFunction.call(ctx, "func-1"),
    ).rejects.toThrow("could not validate");
  });

  it("polls again while a domain isn't ready yet", async () => {
    let call = 0;
    const ctx = Object.assign({}, functionsApi, {
      listDomainsFunction: () => {
        call += 1;
        return Promise.resolve([
          {
            hostname: "a.example.com",
            status: call === 1 ? "pending" : "ready",
          },
        ]);
      },
    });

    const resultPromise = functionsApi.waitDomainsAreDeployedFunction.call(
      ctx,
      "func-1",
    );

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual([
      { hostname: "a.example.com", status: "ready" },
    ]);
    expect(call).toEqual(2);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, functionsApi, {
      listDomainsFunction: () =>
        Promise.resolve([{ hostname: "a.example.com", status: "pending" }]),
    });

    const resultPromise = functionsApi.waitDomainsAreDeployedFunction.call(
      ctx,
      "func-1",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitForContainer", () => {
  it.each(["ready", "error", "locked"])(
    "treats %s as a final status and stops polling",
    async (status) => {
      const container =
        status === "error" ? { status, error_message: "boom" } : { status };
      const ctx = { getContainer: () => Promise.resolve(container) };

      const result = containersApi.waitForContainer.call(ctx, "container-id");

      if (status === "error") {
        await expect(result).rejects.toThrow("boom");
      } else {
        await expect(result).resolves.toEqual(container);
      }
    },
  );

  it("keeps polling on a non-final status (e.g. pending) until it reaches one", async () => {
    let call = 0;
    const ctx = Object.assign({}, containersApi, {
      getContainer: () => {
        call += 1;
        return Promise.resolve({ status: call === 1 ? "pending" : "ready" });
      },
    });

    const resultPromise = containersApi.waitForContainer.call(
      ctx,
      "container-id",
    );

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({ status: "ready" });
    expect(call).toEqual(2);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, containersApi, {
      getContainer: () => Promise.resolve({ status: "pending" }),
    });

    const resultPromise = containersApi.waitForContainer.call(
      ctx,
      "container-id",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitContainersAreDeployed", () => {
  it("resolves with the container list once every container is ready", async () => {
    const ctx = {
      apiManager: {
        get: () =>
          Promise.resolve({
            data: { containers: [{ name: "web", status: "ready" }] },
          }),
      },
    };

    await expect(
      containersApi.waitContainersAreDeployed.call(ctx, "ns-1"),
    ).resolves.toEqual([{ name: "web", status: "ready" }]);
  });

  it("throws as soon as a container reports an error status", async () => {
    const ctx = {
      apiManager: {
        get: () =>
          Promise.resolve({
            data: {
              containers: [
                { name: "web", status: "error", error_message: "crashed" },
              ],
            },
          }),
      },
    };

    await expect(
      containersApi.waitContainersAreDeployed.call(ctx, "ns-1"),
    ).rejects.toThrow("crashed");
  });

  it("wraps a raw API failure through manageError instead of hanging", async () => {
    const err = new Error("network down");
    const ctx = { apiManager: { get: () => Promise.reject(err) } };

    await expect(
      containersApi.waitContainersAreDeployed.call(ctx, "ns-1"),
    ).rejects.toThrow();
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, containersApi, {
      apiManager: {
        get: () =>
          Promise.resolve({
            data: { containers: [{ name: "web", status: "pending" }] },
          }),
      },
    });

    const resultPromise = containersApi.waitContainersAreDeployed.call(
      ctx,
      "ns-1",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitDomainsAreDeployedContainer", () => {
  it("resolves once every domain is ready", async () => {
    const ctx = {
      listDomainsContainer: () =>
        Promise.resolve([{ hostname: "a.example.com", status: "ready" }]),
    };

    await expect(
      containersApi.waitDomainsAreDeployedContainer.call(ctx, "container-1"),
    ).resolves.toEqual([{ hostname: "a.example.com", status: "ready" }]);
  });

  it("throws as soon as a domain reports an error status", async () => {
    const ctx = {
      listDomainsContainer: () =>
        Promise.resolve([
          {
            hostname: "a.example.com",
            status: "error",
            error_message: "could not validate",
          },
        ]),
    };

    await expect(
      containersApi.waitDomainsAreDeployedContainer.call(ctx, "container-1"),
    ).rejects.toThrow("could not validate");
  });

  it("polls again while a domain isn't ready yet", async () => {
    let call = 0;
    const ctx = Object.assign({}, containersApi, {
      listDomainsContainer: () => {
        call += 1;
        return Promise.resolve([
          {
            hostname: "a.example.com",
            status: call === 1 ? "pending" : "ready",
          },
        ]);
      },
    });

    const resultPromise = containersApi.waitDomainsAreDeployedContainer.call(
      ctx,
      "container-1",
    );

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual([
      { hostname: "a.example.com", status: "ready" },
    ]);
    expect(call).toEqual(2);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, containersApi, {
      listDomainsContainer: () =>
        Promise.resolve([{ hostname: "a.example.com", status: "pending" }]),
    });

    const resultPromise = containersApi.waitDomainsAreDeployedContainer.call(
      ctx,
      "container-1",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitNamespaceIsReady", () => {
  it("resolves once the namespace is ready", async () => {
    const ctx = { getNamespace: () => Promise.resolve({ status: "ready" }) };

    await expect(
      namespacesApi.waitNamespaceIsReady.call(ctx, "ns-1"),
    ).resolves.toEqual({ status: "ready" });
  });

  it("throws when the namespace reports an error status", async () => {
    const ctx = {
      getNamespace: () =>
        Promise.resolve({ status: "error", error_message: "ns broken" }),
    };

    await expect(
      namespacesApi.waitNamespaceIsReady.call(ctx, "ns-1"),
    ).rejects.toThrow("ns broken");
  });

  it("polls again (every 1s) while the namespace is still pending", async () => {
    let call = 0;
    const ctx = Object.assign({}, namespacesApi, {
      getNamespace: () => {
        call += 1;
        return Promise.resolve({ status: call === 1 ? "pending" : "ready" });
      },
    });

    const resultPromise = namespacesApi.waitNamespaceIsReady.call(ctx, "ns-1");

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toEqual({ status: "ready" });
    expect(call).toEqual(2);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, namespacesApi, {
      getNamespace: () => Promise.resolve({ status: "pending" }),
    });

    const resultPromise = namespacesApi.waitNamespaceIsReady.call(ctx, "ns-1");
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});

describe("waitNamespaceIsDeleted", () => {
  it("resolves true once the namespace is gone (404)", async () => {
    const err = new Error("not found");
    err.response = { status: 404 };
    const ctx = { getNamespace: () => Promise.reject(err) };

    await expect(
      namespacesApi.waitNamespaceIsDeleted.call(ctx, "ns-1"),
    ).resolves.toBe(true);
  });

  it("resolves true immediately once the API returns a non-deleting namespace", async () => {
    const ctx = {
      getNamespace: () => Promise.resolve({ status: "ready" }),
    };

    await expect(
      namespacesApi.waitNamespaceIsDeleted.call(ctx, "ns-1"),
    ).resolves.toBe(true);
  });

  it("keeps polling while status is 'deleting'", async () => {
    let call = 0;
    const ctx = Object.assign({}, namespacesApi, {
      getNamespace: () => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({ status: "deleting" });
        }
        const err = new Error("not found");
        err.response = { status: 404 };
        return Promise.reject(err);
      },
    });

    const resultPromise = namespacesApi.waitNamespaceIsDeleted.call(
      ctx,
      "ns-1",
    );

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toBe(true);
    expect(call).toEqual(2);
  });

  it("rejects on a non-404 error without hanging forever, preserving the original error message", async () => {
    const err = new Error("server exploded");
    err.response = { status: 500 };
    const ctx = { getNamespace: () => Promise.reject(err) };

    await expect(
      namespacesApi.waitNamespaceIsDeleted.call(ctx, "ns-1"),
    ).rejects.toThrow(/server exploded/);
  });

  it("gives up after ~10 minutes instead of polling forever", async () => {
    const ctx = Object.assign({}, namespacesApi, {
      getNamespace: () => Promise.resolve({ status: "deleting" }),
    });

    const resultPromise = namespacesApi.waitNamespaceIsDeleted.call(
      ctx,
      "ns-1",
    );
    const assertion = expect(resultPromise).rejects.toThrow(/Timed out/);

    await jest.advanceTimersByTimeAsync(610000);

    await assertion;
  });
});
