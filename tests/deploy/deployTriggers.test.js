"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const deployTriggers = require("../../deploy/lib/deployTriggers");

// Returns a promise plus a way to observe whether it has actually settled,
// so tests can prove the code under test really awaited it instead of just
// firing it and moving on.
function deferred() {
  let resolveFn;
  let settled = false;
  const promise = new Promise((resolve) => {
    resolveFn = resolve;
  }).then(() => {
    settled = true;
  });
  return {
    promise,
    resolve: () => resolveFn(),
    isSettled: () => settled,
  };
}

describe("deletePreviousTriggersForApplication", () => {
  it("waits for every delete call to actually complete", async () => {
    const cron = deferred();
    const message = deferred();

    const ctx = {
      deleteCronTrigger: () => cron.promise,
      deleteMessageTrigger: () => message.promise,
    };

    const resultPromise =
      deployTriggers.deletePreviousTriggersForApplication.call(ctx, {
        currentTriggers: [
          { id: "cron-1", schedule: "* * * * *" },
          { id: "msg-1" },
        ],
      });

    // Give pending microtasks a chance to run before either deferred
    // resolves - if the map callbacks didn't return their promises, the
    // whole thing would already be resolved by now.
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(cron.isSettled()).toBe(false);
    jestExpect(message.isSettled()).toBe(false);

    cron.resolve();
    message.resolve();
    await resultPromise;

    jestExpect(cron.isSettled()).toBe(true);
    jestExpect(message.isSettled()).toBe(true);
  });

  it("propagates a delete failure instead of swallowing it", async () => {
    const ctx = {
      deleteCronTrigger: () => Promise.reject(new Error("delete failed")),
      deleteMessageTrigger: () => Promise.resolve(),
    };

    await jestExpect(
      deployTriggers.deletePreviousTriggersForApplication.call(ctx, {
        currentTriggers: [{ id: "cron-1", schedule: "* * * * *" }],
      })
    ).rejects.toThrow("delete failed");
  });
});

describe("createNewTriggersForApplication", () => {
  function ctxWithEvents(events) {
    return {
      provider: {
        serverless: {
          service: {
            functions: { first: { events } },
          },
        },
        getScwProject: () => "project-id",
        getScwRegion: () => "fr-par",
      },
    };
  }

  it("waits for a schedule trigger's create call to actually complete", async () => {
    const created = deferred();
    const ctx = ctxWithEvents([{ schedule: { rate: "1 * * * *" } }]);
    ctx.createCronTrigger = () => created.promise;

    const resultPromise = deployTriggers.createNewTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      true
    );

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(created.isSettled()).toBe(false);

    created.resolve();
    await resultPromise;

    jestExpect(created.isSettled()).toBe(true);
  });

  it("waits for an nats trigger's create call to actually complete", async () => {
    const created = deferred();
    const ctx = ctxWithEvents([{ nats: { name: "n", scw_nats_config: {} } }]);
    ctx.createMessageTrigger = () => created.promise;

    const resultPromise = deployTriggers.createNewTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      true
    );

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(created.isSettled()).toBe(false);

    created.resolve();
    await resultPromise;

    jestExpect(created.isSettled()).toBe(true);
  });

  it("waits for an sqs trigger's create call to actually complete", async () => {
    const created = deferred();
    const ctx = ctxWithEvents([{ sqs: { name: "q", queue: "my-queue" } }]);
    ctx.createMessageTrigger = () => created.promise;

    const resultPromise = deployTriggers.createNewTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      true
    );

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(created.isSettled()).toBe(false);

    created.resolve();
    await resultPromise;

    jestExpect(created.isSettled()).toBe(true);
  });

  it("propagates a create failure instead of swallowing it", async () => {
    const ctx = ctxWithEvents([{ schedule: { rate: "1 * * * *" } }]);
    ctx.createCronTrigger = () => Promise.reject(new Error("create failed"));

    await jestExpect(
      deployTriggers.createNewTriggersForApplication.call(
        ctx,
        { id: "app-1", name: "first" },
        true
      )
    ).rejects.toThrow("create failed");
  });
});
