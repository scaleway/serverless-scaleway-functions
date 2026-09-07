"use strict";

const jestExpect = expect;

const createFunctions = require("../../deploy/lib/createFunctions");
const createContainers = require("../../deploy/lib/createContainers");

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

function baseCtx(listExistingDomains) {
  return {
    ...createFunctions,
    ...createContainers,
    namespace: { registry_endpoint: "rg.fr-par.scw.cloud/ns" },
    serverless: { cli: { log: () => {} } },
    listDomainsFunction: () => Promise.resolve(listExistingDomains),
    listDomainsContainer: () => Promise.resolve(listExistingDomains),
  };
}

describe("applyDomainsFunc", () => {
  it("waits for both the create and the delete domain calls to complete", async () => {
    const create = deferred();
    const del = deferred();
    const ctx = baseCtx([{ hostname: "old.example.com", id: "domain-old" }]);
    ctx.createDomainAndLog = () => create.promise;
    ctx.deleteDomain = () =>
      del.promise.then(() => ({ hostname: "old.example.com" }));

    const resultPromise = createFunctions.applyDomainsFunc.call(ctx, "func-1", [
      "new.example.com",
    ]);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(create.isSettled()).toBe(false);
    jestExpect(del.isSettled()).toBe(false);

    create.resolveWith();
    del.resolveWith();
    await resultPromise;

    jestExpect(create.isSettled()).toBe(true);
    jestExpect(del.isSettled()).toBe(true);
  });
});

describe("applyDomainsContainer", () => {
  it("waits for both the create and the delete domain calls to complete", async () => {
    const create = deferred();
    const del = deferred();
    const ctx = baseCtx([{ hostname: "old.example.com", id: "domain-old" }]);
    ctx.createDomainAndLog = () => create.promise;
    ctx.deleteDomain = () =>
      del.promise.then(() => ({ hostname: "old.example.com" }));

    const resultPromise = createContainers.applyDomainsContainer.call(
      ctx,
      "container-1",
      ["new.example.com"],
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(create.isSettled()).toBe(false);
    jestExpect(del.isSettled()).toBe(false);

    create.resolveWith();
    del.resolveWith();
    await resultPromise;

    jestExpect(create.isSettled()).toBe(true);
    jestExpect(del.isSettled()).toBe(true);
  });
});

describe("updateSingleFunction", () => {
  it("applies domains and waits for both the domain apply and the function update", async () => {
    const domains = deferred();
    const funcUpdate = deferred();
    const ctx = baseCtx([]);
    ctx.createDomainAndLog = () => Promise.resolve();
    ctx.deleteDomain = () => Promise.resolve({ hostname: "" });
    ctx.applyDomainsFunc = () => domains.promise;
    ctx.updateFunction = () =>
      funcUpdate.promise.then(() => ({ name: "first" }));
    ctx.listRuntimes = () =>
      Promise.resolve([
        { language: "node", name: "node18", status: "available" },
      ]);
    ctx.serverless = { cli: { log: () => {} } };

    const resultPromise = createFunctions.updateSingleFunction.call(
      ctx,
      { runtime: "node18", custom_domains: ["new.example.com"] },
      { id: "func-1", secret_environment_variables: [] },
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(domains.isSettled()).toBe(false);
    jestExpect(funcUpdate.isSettled()).toBe(false);

    domains.resolveWith();
    funcUpdate.resolveWith();
    await resultPromise;

    jestExpect(domains.isSettled()).toBe(true);
    jestExpect(funcUpdate.isSettled()).toBe(true);
  });
});

describe("updateSingleContainer", () => {
  it("finishes applying domains before updating the container starts", async () => {
    const order = [];
    const domains = deferred();
    const ctx = baseCtx([]);
    ctx.createDomainAndLog = () => Promise.resolve();
    ctx.deleteDomain = () => Promise.resolve({ hostname: "" });
    ctx.applyDomainsContainer = (...args) => {
      order.push("applyDomains:start");
      return domains.promise.then(() => {
        order.push("applyDomains:end");
      });
    };
    ctx.updateContainer = () => {
      order.push("updateContainer");
      // "pending" short-circuits the post-update redeploy branch, which
      // this test isn't exercising.
      return Promise.resolve({ status: "pending" });
    };
    ctx.serverless = { cli: { log: () => {} } };

    const resultPromise = createContainers.updateSingleContainer.call(
      ctx,
      { custom_domains: ["new.example.com"] },
      { id: "container-1", secret_environment_variables: [] },
    );

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(order).toEqual(["applyDomains:start"]);

    domains.resolveWith();
    await resultPromise;

    jestExpect(order).toEqual([
      "applyDomains:start",
      "applyDomains:end",
      "updateContainer",
    ]);
  });
});
