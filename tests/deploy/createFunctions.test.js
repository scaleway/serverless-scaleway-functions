"use strict";

const jestExpect = expect;

const createFunctions = require("../../deploy/lib/createFunctions");
const {
  RUNTIME_STATUS_AVAILABLE,
  RUNTIME_STATUS_EOL,
  RUNTIME_STATUS_EOS,
} = require("../../shared/runtimes");

function loggerCapturing() {
  const logs = [];
  return { log: (msg) => logs.push(msg), logs };
}

describe("validateRuntime", () => {
  it("returns the runtime name unchanged when it is available", () => {
    const logger = loggerCapturing();
    const existingRuntimes = [
      { language: "node", name: "node20", status: RUNTIME_STATUS_AVAILABLE },
    ];

    const result = createFunctions.validateRuntime.call(
      {},
      { runtime: "node20" },
      existingRuntimes,
      logger,
    );

    jestExpect(result).toEqual("node20");
    jestExpect(logger.logs).toEqual([]);
  });

  it("falls back to this.runtime when func.runtime is not set", () => {
    const existingRuntimes = [
      { language: "node", name: "node20", status: RUNTIME_STATUS_AVAILABLE },
    ];

    const result = createFunctions.validateRuntime.call(
      { runtime: "node20" },
      {},
      existingRuntimes,
      loggerCapturing(),
    );

    jestExpect(result).toEqual("node20");
  });

  it("still returns the runtime but logs a warning when it is end-of-life", () => {
    const logger = loggerCapturing();
    const existingRuntimes = [
      {
        language: "node",
        name: "node14",
        status: RUNTIME_STATUS_EOL,
        statusMessage: "please migrate",
      },
    ];

    const result = createFunctions.validateRuntime.call(
      {},
      { runtime: "node14" },
      existingRuntimes,
      logger,
    );

    jestExpect(result).toEqual("node14");
    jestExpect(logger.logs).toHaveLength(1);
    jestExpect(logger.logs[0]).toContain("End Of Life");
    jestExpect(logger.logs[0]).toContain("please migrate");
  });

  it("still returns the runtime but logs a warning when it is end-of-support", () => {
    const logger = loggerCapturing();
    const existingRuntimes = [
      {
        language: "node",
        name: "node14",
        status: RUNTIME_STATUS_EOS,
        statusMessage: "no longer creatable",
      },
    ];

    const result = createFunctions.validateRuntime.call(
      {},
      { runtime: "node14" },
      existingRuntimes,
      logger,
    );

    jestExpect(result).toEqual("node14");
    jestExpect(logger.logs).toHaveLength(1);
    jestExpect(logger.logs[0]).toContain("End Of Support");
  });

  it("warns for an unrecognized runtime status without a status message", () => {
    const logger = loggerCapturing();
    const existingRuntimes = [
      { language: "node", name: "node14", status: "some_future_status" },
    ];

    const result = createFunctions.validateRuntime.call(
      {},
      { runtime: "node14" },
      existingRuntimes,
      logger,
    );

    jestExpect(result).toEqual("node14");
    jestExpect(logger.logs).toEqual([
      "WARNING: Runtime node14 is in status some_future_status",
    ]);
  });

  it("appends the status message for an unrecognized runtime status when one is present", () => {
    const logger = loggerCapturing();
    const existingRuntimes = [
      {
        language: "node",
        name: "node14",
        status: "some_future_status",
        statusMessage: "extra detail",
      },
    ];

    createFunctions.validateRuntime.call(
      {},
      { runtime: "node14" },
      existingRuntimes,
      logger,
    );

    jestExpect(logger.logs[0]).toContain("extra detail");
  });

  it("throws listing the available runtimes when the requested one doesn't exist", () => {
    const existingRuntimes = [
      { language: "node", name: "node20", status: RUNTIME_STATUS_AVAILABLE },
      {
        language: "python",
        name: "python311",
        status: RUNTIME_STATUS_AVAILABLE,
      },
    ];

    jestExpect(() =>
      createFunctions.validateRuntime.call(
        {},
        { runtime: "ruby30" },
        existingRuntimes,
        loggerCapturing(),
      ),
    ).toThrow(/must be one of: node20, python311/);
  });

  it("throws a 'cannot list runtimes' error when the runtime list itself is empty", () => {
    jestExpect(() =>
      createFunctions.validateRuntime.call(
        {},
        { runtime: "node20" },
        [],
        loggerCapturing(),
      ),
    ).toThrow(/cannot list runtimes/);
  });
});

describe("updateSingleFunction", () => {
  function baseCtx() {
    return {
      serverless: { cli: { log: () => {} } },
      listRuntimes: () => Promise.resolve([]),
      validateRuntime: () => "node20",
      updateFunction: (id, params) =>
        Promise.resolve({ id, name: "first", params }),
      applyDomainsFunc: () => Promise.resolve(),
    };
  }

  it("clears private_network_id when it was set on the API but removed from serverless.yml", async () => {
    const ctx = baseCtx();
    let capturedParams;
    ctx.updateFunction = (id, params) => {
      capturedParams = params;
      return Promise.resolve({ id, name: "first" });
    };

    await createFunctions.updateSingleFunction.call(
      ctx,
      { name: "first", privateNetworkId: undefined },
      {
        id: "func-1",
        private_network_id: "pn-1",
        secret_environment_variables: [],
      },
    );

    jestExpect(capturedParams.private_network_id).toEqual("");
  });

  it("keeps the configured private_network_id when it is still set in serverless.yml", async () => {
    const ctx = baseCtx();
    let capturedParams;
    ctx.updateFunction = (id, params) => {
      capturedParams = params;
      return Promise.resolve({ id, name: "first" });
    };

    await createFunctions.updateSingleFunction.call(
      ctx,
      { name: "first", privateNetworkId: "pn-2" },
      {
        id: "func-1",
        private_network_id: "pn-1",
        secret_environment_variables: [],
      },
    );

    jestExpect(capturedParams.private_network_id).toEqual("pn-2");
  });

  it("waits for both the update and the domain sync before resolving", async () => {
    const ctx = baseCtx();
    let domainsResolved = false;
    let domainsResolve;
    ctx.applyDomainsFunc = () =>
      new Promise((resolve) => {
        domainsResolve = () => {
          domainsResolved = true;
          resolve();
        };
      });

    const resultPromise = createFunctions.updateSingleFunction.call(
      ctx,
      { name: "first" },
      { id: "func-1", secret_environment_variables: [] },
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(domainsResolved).toBe(false);

    domainsResolve();
    const result = await resultPromise;

    jestExpect(domainsResolved).toBe(true);
    jestExpect(result.name).toEqual("first");
  });
});
