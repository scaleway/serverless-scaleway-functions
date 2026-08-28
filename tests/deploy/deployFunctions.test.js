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
      })
    ).rejects.toThrow("domain error");
  });
});
