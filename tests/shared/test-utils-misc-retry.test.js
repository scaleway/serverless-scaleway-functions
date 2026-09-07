"use strict";

// Covers tests/utils/misc/index.ts's three retry helpers - previously
// exercised only indirectly by the live-API suites (functions.test.js,
// containers.test.js, etc), which need real credentials/Docker and can't
// run offline. Placed under tests/shared/, not tests/utils/, because
// package.json's jest config lists "tests/utils" in
// testPathIgnorePatterns - a test file there would silently never run.

const jestExpect = expect;

const childProcess = require("../../shared/child-process");

describe("serverlessInvokeWithRetry", () => {
  let execSyncSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    execSyncSpy = jest.spyOn(childProcess, "execSync");
  });

  afterEach(() => {
    execSyncSpy.mockRestore();
    jest.useRealTimers();
  });

  function loadMisc() {
    return require("../utils/misc");
  }

  it("returns a non-empty result immediately, without retrying", async () => {
    execSyncSpy.mockReturnValue("hello world");
    const { serverlessInvokeWithRetry } = loadMisc();

    const result = await serverlessInvokeWithRetry({ serviceName: "first" });

    jestExpect(result).toBe("hello world");
    jestExpect(execSyncSpy).toHaveBeenCalledTimes(1);
  });

  it("retries an empty result and returns the first non-empty one", async () => {
    execSyncSpy
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("real output");
    const { serverlessInvokeWithRetry } = loadMisc();

    const resultPromise = serverlessInvokeWithRetry({ serviceName: "first" });
    await jest.advanceTimersByTimeAsync(30000);

    jestExpect(await resultPromise).toBe("real output");
    jestExpect(execSyncSpy).toHaveBeenCalledTimes(3);
  });

  it("returns the last empty result instead of throwing once attempts are exhausted", async () => {
    execSyncSpy.mockReturnValue("");
    const { serverlessInvokeWithRetry } = loadMisc();

    const resultPromise = serverlessInvokeWithRetry({ serviceName: "first" });
    await jest.advanceTimersByTimeAsync(60000);

    jestExpect(await resultPromise).toBe("");
    jestExpect(execSyncSpy).toHaveBeenCalledTimes(6);
  });

  it("retries a DNS-not-found thrown error and succeeds on a later attempt", async () => {
    // shared/child-process.ts's execSync wrapper attaches stdout/stderr
    // (real Buffers in production) to the error it rethrows -
    // isDnsNotFoundError() reads those via .toString(), not err.message.
    // Plain strings satisfy that same contract without needing the
    // Buffer global in this plain-.js test file.
    const dnsError = Object.assign(new Error("Command failed"), {
      stdout: "",
      stderr: "Error: getaddrinfo ENOTFOUND foo.functions.fnc.example.com",
    });
    execSyncSpy
      .mockImplementationOnce(() => {
        throw dnsError;
      })
      .mockReturnValueOnce("real output");
    const { serverlessInvokeWithRetry } = loadMisc();

    const resultPromise = serverlessInvokeWithRetry({ serviceName: "first" });
    await jest.advanceTimersByTimeAsync(30000);

    jestExpect(await resultPromise).toBe("real output");
    jestExpect(execSyncSpy).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-DNS error immediately, without retrying", async () => {
    const realError = new Error("handler crashed");
    execSyncSpy.mockImplementation(() => {
      throw realError;
    });
    const { serverlessInvokeWithRetry } = loadMisc();

    await jestExpect(
      serverlessInvokeWithRetry({ serviceName: "first" }),
    ).rejects.toThrow("handler crashed");
    jestExpect(execSyncSpy).toHaveBeenCalledTimes(1);
  });
});

describe("getNamespaceFromListWithRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the namespace immediately once found", async () => {
    const { getNamespaceFromListWithRetry } = require("../utils/misc");
    const api = {
      getNamespaceFromList: jest.fn().mockResolvedValue({ id: "ns-1" }),
    };

    const result = await getNamespaceFromListWithRetry(
      api,
      "my-service",
      "proj-1",
    );

    jestExpect(result).toEqual({ id: "ns-1" });
    jestExpect(api.getNamespaceFromList).toHaveBeenCalledTimes(1);
  });

  it("retries a falsy result and returns undefined once attempts are exhausted", async () => {
    const { getNamespaceFromListWithRetry } = require("../utils/misc");
    const api = {
      getNamespaceFromList: jest.fn().mockResolvedValue(undefined),
    };

    const resultPromise = getNamespaceFromListWithRetry(
      api,
      "my-service",
      "proj-1",
    );
    await jest.advanceTimersByTimeAsync(30000);

    jestExpect(await resultPromise).toBeUndefined();
    jestExpect(api.getNamespaceFromList).toHaveBeenCalledTimes(6);
  });

  it("retries a thrown error and succeeds once it clears", async () => {
    const { getNamespaceFromListWithRetry } = require("../utils/misc");
    const api = {
      getNamespaceFromList: jest
        .fn()
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce({ id: "ns-1" }),
    };

    const resultPromise = getNamespaceFromListWithRetry(
      api,
      "my-service",
      "proj-1",
    );
    await jest.advanceTimersByTimeAsync(30000);

    jestExpect(await resultPromise).toEqual({ id: "ns-1" });
  });

  it("rethrows the error once attempts are exhausted", async () => {
    const { getNamespaceFromListWithRetry } = require("../utils/misc");
    const api = {
      getNamespaceFromList: jest
        .fn()
        .mockRejectedValue(new Error("still failing")),
    };

    const resultPromise = getNamespaceFromListWithRetry(
      api,
      "my-service",
      "proj-1",
    );
    const assertion =
      jestExpect(resultPromise).rejects.toThrow("still failing");
    await jest.advanceTimersByTimeAsync(30000);

    await assertion;
    jestExpect(api.getNamespaceFromList).toHaveBeenCalledTimes(6);
  });
});

describe("isNamespaceRemoved", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns true immediately on a 404", async () => {
    const { isNamespaceRemoved } = require("../utils/misc");
    const api = {
      getNamespace: jest.fn().mockRejectedValue({ status: 404 }),
    };

    const result = await isNamespaceRemoved(api, "ns-1");

    jestExpect(result).toBe(true);
    jestExpect(api.getNamespace).toHaveBeenCalledTimes(1);
  });

  it("keeps polling while the namespace still exists, then confirms 404", async () => {
    const { isNamespaceRemoved } = require("../utils/misc");
    const api = {
      getNamespace: jest
        .fn()
        .mockResolvedValueOnce({ status: "deleting" })
        .mockResolvedValueOnce({ status: "deleting" })
        .mockRejectedValueOnce({ status: 404 }),
    };

    const resultPromise = isNamespaceRemoved(api, "ns-1");
    await jest.advanceTimersByTimeAsync(30000);

    jestExpect(await resultPromise).toBe(true);
    jestExpect(api.getNamespace).toHaveBeenCalledTimes(3);
  });

  it("returns false instead of throwing once attempts are exhausted with no 404 seen", async () => {
    const { isNamespaceRemoved } = require("../utils/misc");
    const api = {
      getNamespace: jest.fn().mockResolvedValue({ status: "deleting" }),
    };

    const resultPromise = isNamespaceRemoved(api, "ns-1");
    await jest.advanceTimersByTimeAsync(30000);

    jestExpect(await resultPromise).toBe(false);
    jestExpect(api.getNamespace).toHaveBeenCalledTimes(6);
  });

  it("retries a non-404 error and rethrows once attempts are exhausted", async () => {
    const { isNamespaceRemoved } = require("../utils/misc");
    const networkError = new Error("fetch failed");
    const api = {
      getNamespace: jest.fn().mockRejectedValue(networkError),
    };

    const resultPromise = isNamespaceRemoved(api, "ns-1");
    const assertion = jestExpect(resultPromise).rejects.toThrow("fetch failed");
    await jest.advanceTimersByTimeAsync(30000);

    await assertion;
    jestExpect(api.getNamespace).toHaveBeenCalledTimes(6);
  });
});

describe("createProject", () => {
  afterEach(() => {
    jest.dontMock("../../shared/api");
  });

  it("resolves with the created project, with no artificial delay", async () => {
    jest.doMock("../../shared/api", () => ({
      AccountApi: jest.fn().mockImplementation(() => ({
        createProject: jest
          .fn()
          .mockResolvedValue({ id: "proj-1", name: "test-proj" }),
      })),
    }));
    jest.resetModules();
    const { createProject } = require("../utils/misc");

    const result = await createProject();

    jestExpect(result).toEqual({ id: "proj-1", name: "test-proj" });
  });

  it("propagates a clear error immediately if the project itself fails to create", async () => {
    jest.doMock("../../shared/api", () => ({
      AccountApi: jest.fn().mockImplementation(() => ({
        createProject: jest.fn().mockRejectedValue(new Error("quota exceeded")),
      })),
    }));
    jest.resetModules();
    const { createProject } = require("../utils/misc");

    await jestExpect(createProject()).rejects.toThrow("quota exceeded");
  });
});
