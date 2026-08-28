"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const deployFunctions = require("../../deploy/lib/deployFunctions");

function deferred() {
  let resolveFn;
  let settled = false;
  const promise = new Promise((resolve) => {
    resolveFn = resolve;
  }).then(() => {
    settled = true;
  });
  return {
    resolveWith: (value) => resolveFn(value),
    promise,
    isSettled: () => settled,
  };
}

describe("waitForDomainsDeployment", () => {
  it("waits for the domain deployment check to actually complete", async () => {
    const domains = deferred();
    const ctx = {
      serverless: { cli: { log: () => {} } },
      waitDomainsAreDeployedFunction: () =>
        domains.promise.then(() => [{ hostname: "my-func.example.com" }]),
    };

    const resultPromise = deployFunctions.waitForDomainsDeployment.call(ctx, {
      id: "func-1",
      name: "first",
    });

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(domains.isSettled()).toBe(false);

    domains.resolveWith();
    await resultPromise;

    jestExpect(domains.isSettled()).toBe(true);
  });

  it("propagates a domain deployment failure instead of swallowing it", async () => {
    const ctx = {
      serverless: { cli: { log: () => {} } },
      waitDomainsAreDeployedFunction: () =>
        Promise.reject(new Error("domain error")),
    };

    await jestExpect(
      deployFunctions.waitForDomainsDeployment.call(ctx, {
        id: "func-1",
        name: "first",
      }),
    ).rejects.toThrow("domain error");
  });
});

describe("deployEachFunction (bounded concurrency)", () => {
  function makeFunctions(count) {
    return Array.from({ length: count }, (_, i) => ({
      id: `func-${i}`,
      name: `func-${i}`,
    }));
  }

  function trackingCtx(functions) {
    let inFlight = 0;
    let peakInFlight = 0;
    const order = [];

    const ctx = {
      ...deployFunctions,
      serverless: { cli: { log: () => {} } },
      functions,
      deployFunction: (id) => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        // Resolve on a fresh microtask so items genuinely overlap instead
        // of completing synchronously one at a time.
        return Promise.resolve().then(() => {
          inFlight -= 1;
          order.push(id);
          return { id, name: id };
        });
      },
      waitForFunctionStatus: (id) => Promise.resolve({ id, name: id }),
      printFunctionInformationAfterDeployment: (func) => func,
      waitForDomainsDeployment: () => Promise.resolve(),
    };

    return { ctx, getPeakInFlight: () => peakInFlight, getOrder: () => order };
  }

  it("never runs more than DEPLOY_FUNCTIONS_CONCURRENCY (5) deploys at once", async () => {
    const { ctx, getPeakInFlight } = trackingCtx(makeFunctions(12));

    await deployFunctions.deployEachFunction.call(ctx);

    jestExpect(getPeakInFlight()).toBeLessThanOrEqual(5);
    jestExpect(getPeakInFlight()).toBeGreaterThan(1);
  });

  it("processes every function even when the count isn't a multiple of the concurrency limit", async () => {
    const { ctx, getOrder } = trackingCtx(makeFunctions(7));

    await deployFunctions.deployEachFunction.call(ctx);

    jestExpect(getOrder()).toHaveLength(7);
  });

  it("preserves input order in the results regardless of completion order", async () => {
    // The real waitForDomainsDeployment resolves to undefined (it only
    // logs), so deployEachFunction's real per-item results aren't
    // individually meaningful - only that mapWithConcurrency places each
    // one at the correct index. This mock deliberately returns `func` from
    // waitForDomainsDeployment instead, purely so the result array is
    // observable for that purpose.
    const functions = makeFunctions(3);
    const delays = { "func-0": 30, "func-1": 10, "func-2": 20 };
    const ctx = {
      ...deployFunctions,
      serverless: { cli: { log: () => {} } },
      functions,
      deployFunction: (id) =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ id, name: id }), delays[id]);
        }),
      waitForFunctionStatus: (id) => Promise.resolve({ id, name: id }),
      printFunctionInformationAfterDeployment: (func) => func,
      waitForDomainsDeployment: (func) => Promise.resolve(func),
    };

    const result = await deployFunctions.deployEachFunction.call(ctx);

    jestExpect(result.map((r) => r.id)).toEqual(["func-0", "func-1", "func-2"]);
  });

  it("propagates a failure from any single deploy instead of swallowing it", async () => {
    const functions = makeFunctions(3);
    const ctx = {
      ...deployFunctions,
      serverless: { cli: { log: () => {} } },
      functions,
      deployFunction: (id) =>
        id === "func-1"
          ? Promise.reject(new Error("deploy failed"))
          : Promise.resolve({ id, name: id }),
      waitForFunctionStatus: (id) => Promise.resolve({ id, name: id }),
      printFunctionInformationAfterDeployment: (func) => func,
      waitForDomainsDeployment: () => Promise.resolve(),
    };

    await jestExpect(
      deployFunctions.deployEachFunction.call(ctx),
    ).rejects.toThrow("deploy failed");
  });
});
