"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

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

describe("deleteFunctionsByIds", () => {
  it("logs 'deleted' only after waitForFunctionStatus actually confirms it", async () => {
    const wait = deferred();
    const logs = [];
    const ctx = {
      serverless: { cli: { log: (msg) => logs.push(msg) } },
      deleteFunction: () => Promise.resolve({ name: "first" }),
      waitForFunctionStatus: () => wait.promise,
    };

    const resultPromise = createFunctions.deleteFunctionsByIds.call(ctx, [
      "func-1",
    ]);

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(logs).toEqual([
      "Function first removed from config file, deleting it...",
    ]);
    jestExpect(wait.isSettled()).toBe(false);

    wait.resolveWith();
    await resultPromise;

    jestExpect(logs).toEqual([
      "Function first removed from config file, deleting it...",
      "Function first deleted",
    ]);
  });

  it("waits for every delete to complete and propagates a failure", async () => {
    const ctx = {
      serverless: { cli: { log: () => {} } },
      deleteFunction: () => Promise.reject(new Error("delete failed")),
      waitForFunctionStatus: () => Promise.resolve(),
    };

    await jestExpect(
      createFunctions.deleteFunctionsByIds.call(ctx, ["func-1"]),
    ).rejects.toThrow("delete failed");
  });
});

describe("deleteContainersByIds", () => {
  it("logs 'deleted' only after waitForContainer actually confirms it", async () => {
    const wait = deferred();
    const logs = [];
    const ctx = {
      serverless: { cli: { log: (msg) => logs.push(msg) } },
      deleteContainer: () => Promise.resolve({ name: "first" }),
      waitForContainer: () => wait.promise,
    };

    const resultPromise = createContainers.deleteContainersByIds.call(ctx, [
      "container-1",
    ]);

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(logs).toEqual([
      "Container first removed from config file, deleting it...",
    ]);
    jestExpect(wait.isSettled()).toBe(false);

    wait.resolveWith();
    await resultPromise;

    jestExpect(logs).toEqual([
      "Container first removed from config file, deleting it...",
      "Container first deleted",
    ]);
  });

  it("waits for every delete to complete and propagates a failure", async () => {
    const ctx = {
      serverless: { cli: { log: () => {} } },
      deleteContainer: () => Promise.reject(new Error("delete failed")),
      waitForContainer: () => Promise.resolve(),
    };

    await jestExpect(
      createContainers.deleteContainersByIds.call(ctx, ["container-1"]),
    ).rejects.toThrow("delete failed");
  });
});

describe("createOrUpdateFunctions", () => {
  it("waits for deletes and create/update work to both actually complete", async () => {
    const del = deferred();
    const update = deferred();
    const ctx = {
      provider: { serverless: { service: { functions: { first: {} } } } },
      serverless: {
        cli: { log: () => {} },
        configurationInput: { singleSource: true },
      },
      deleteFunctionsByIds: () => del.promise,
      updateSingleFunction: () =>
        update.promise.then(() => ({ name: "first" })),
      createSingleFunction: () => Promise.resolve({ name: "first" }),
    };

    const resultPromise = createFunctions.createOrUpdateFunctions.call(ctx, [
      { name: "first", id: "func-1" },
    ]);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(del.isSettled()).toBe(false);
    jestExpect(update.isSettled()).toBe(false);

    del.resolveWith();
    update.resolveWith();
    await resultPromise;

    jestExpect(del.isSettled()).toBe(true);
    jestExpect(update.isSettled()).toBe(true);
    jestExpect(ctx.functions).toEqual([{ name: "first" }]);
  });
});

describe("createOrUpdateContainers", () => {
  it("waits for deletes and create/update work to both actually complete", async () => {
    const del = deferred();
    const update = deferred();
    const ctx = {
      provider: {
        serverless: { service: { custom: { containers: { first: {} } } } },
      },
      serverless: {
        cli: { log: () => {} },
        configurationInput: { singleSource: true },
      },
      deleteContainersByIds: () => del.promise,
      createSingleContainer: () =>
        update.promise.then(() => ({ name: "first" })),
    };

    const resultPromise = createContainers.createOrUpdateContainers.call(
      ctx,
      [],
    );

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(del.isSettled()).toBe(false);
    jestExpect(update.isSettled()).toBe(false);

    del.resolveWith();
    update.resolveWith();
    await resultPromise;

    jestExpect(del.isSettled()).toBe(true);
    jestExpect(update.isSettled()).toBe(true);
    jestExpect(ctx.containers).toEqual([{ name: "first" }]);
  });
});
