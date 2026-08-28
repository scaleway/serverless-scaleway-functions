"use strict";

const jestExpect = expect;

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
      }),
    ).rejects.toThrow("delete failed");
  });

  it("passes isFunction through to deleteCronTrigger and the whole trigger object through to deleteMessageTrigger", async () => {
    const cronCalls = [];
    const messageCalls = [];
    const messageTrigger = { id: "msg-1", sourceType: "sqs" };
    const ctx = {
      deleteCronTrigger: (...args) => {
        cronCalls.push(args);
        return Promise.resolve();
      },
      deleteMessageTrigger: (...args) => {
        messageCalls.push(args);
        return Promise.resolve();
      },
    };

    await deployTriggers.deletePreviousTriggersForApplication.call(
      ctx,
      {
        currentTriggers: [
          { id: "cron-1", schedule: "* * * * *" },
          messageTrigger,
        ],
      },
      false,
    );

    jestExpect(cronCalls).toEqual([["cron-1", false]]);
    jestExpect(messageCalls).toEqual([[messageTrigger, false]]);
  });
});

describe("manageTriggers", () => {
  it("does nothing and returns undefined when there are no applications", async () => {
    const ctx = {
      getTriggersForApplication: jest.fn(),
      deletePreviousTriggersForApplication: jest.fn(),
      createNewTriggersForApplication: jest.fn(),
    };

    const result = await deployTriggers.manageTriggers.call(ctx, [], true);

    jestExpect(result).toBeUndefined();
    jestExpect(ctx.getTriggersForApplication).not.toHaveBeenCalled();
  });

  it("does nothing when applications is undefined/null", async () => {
    const ctx = {};

    jestExpect(
      await deployTriggers.manageTriggers.call(ctx, undefined, true),
    ).toBeUndefined();
    jestExpect(
      await deployTriggers.manageTriggers.call(ctx, null, true),
    ).toBeUndefined();
  });

  it("chains get -> delete -> create -> print in order for each application, passing data through", async () => {
    const calls = [];
    const ctx = {
      getTriggersForApplication: (application, isFunction) => {
        calls.push(["get", application.id, isFunction]);
        return Promise.resolve({ ...application, currentTriggers: ["old"] });
      },
      deletePreviousTriggersForApplication: (appWithTriggers) => {
        calls.push(["delete", appWithTriggers.currentTriggers]);
        return Promise.resolve();
      },
      createNewTriggersForApplication: (application, isFunction) => {
        calls.push(["create", application.id, isFunction]);
        return Promise.resolve(["new-trigger"]);
      },
      printDeployedTriggersForApplication: (application, triggers) => {
        calls.push(["print", application.id, triggers]);
        return undefined;
      },
    };

    await deployTriggers.manageTriggers.call(
      ctx,
      [{ id: "app-1", name: "first" }],
      true,
    );

    jestExpect(calls).toEqual([
      ["get", "app-1", true],
      ["delete", ["old"]],
      ["create", "app-1", true],
      ["print", "app-1", ["new-trigger"]],
    ]);
  });

  it("propagates a failure from any step of the chain instead of swallowing it", async () => {
    const ctx = {
      getTriggersForApplication: () => Promise.reject(new Error("get failed")),
    };

    await jestExpect(
      deployTriggers.manageTriggers.call(
        ctx,
        [{ id: "app-1", name: "first" }],
        true,
      ),
    ).rejects.toThrow("get failed");
  });
});

describe("getTriggersForApplication", () => {
  it("spreads the fetched triggers into a new currentTriggers array on the application", async () => {
    const ctx = {
      listTriggersForApplication: (id, isFunction) => {
        jestExpect(id).toEqual("app-1");
        jestExpect(isFunction).toBe(true);
        return Promise.resolve([{ id: "trigger-1" }]);
      },
    };

    const result = await deployTriggers.getTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      true,
    );

    jestExpect(result).toEqual({
      id: "app-1",
      name: "first",
      currentTriggers: [{ id: "trigger-1" }],
    });
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
      true,
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
      true,
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
      true,
    );

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(created.isSettled()).toBe(false);

    created.resolve();
    await resultPromise;

    jestExpect(created.isSettled()).toBe(true);
  });

  it("names each schedule event cron-<index>, for Containers' sourceType:'cron' Trigger naming", async () => {
    const capturedParams = [];
    const ctx = {
      provider: {
        serverless: {
          service: {
            custom: {
              containers: {
                first: {
                  events: [
                    { schedule: { rate: "1 * * * *" } },
                    {
                      schedule: {
                        rate: "2 * * * *",
                        input: { key: "value" },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      createCronTrigger: (applicationId, isFunction, params) => {
        capturedParams.push(params);
        return Promise.resolve();
      },
    };

    await deployTriggers.createNewTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      false,
    );

    jestExpect(capturedParams).toEqual([
      { name: "cron-0", schedule: "1 * * * *", args: {} },
      { name: "cron-1", schedule: "2 * * * *", args: { key: "value" } },
    ]);
  });

  it("propagates a create failure instead of swallowing it", async () => {
    const ctx = ctxWithEvents([{ schedule: { rate: "1 * * * *" } }]);
    ctx.createCronTrigger = () => Promise.reject(new Error("create failed"));

    await jestExpect(
      deployTriggers.createNewTriggersForApplication.call(
        ctx,
        { id: "app-1", name: "first" },
        true,
      ),
    ).rejects.toThrow("create failed");
  });

  it("resolves to an empty array without creating anything when the application is no longer in serverless.yml", async () => {
    const ctx = {
      provider: {
        serverless: { service: { functions: {} } },
      },
      createCronTrigger: jest.fn(),
      createMessageTrigger: jest.fn(),
    };

    const result = await deployTriggers.createNewTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      true,
    );

    jestExpect(result).toEqual([]);
    jestExpect(ctx.createCronTrigger).not.toHaveBeenCalled();
    jestExpect(ctx.createMessageTrigger).not.toHaveBeenCalled();
  });

  it("reads container events from custom.containers when isFunction is false", async () => {
    const created = deferred();
    const ctx = {
      provider: {
        serverless: {
          service: {
            custom: {
              containers: {
                first: { events: [{ schedule: { rate: "1 * * * *" } }] },
              },
            },
          },
        },
      },
      createCronTrigger: () => created.promise,
    };

    const resultPromise = deployTriggers.createNewTriggersForApplication.call(
      ctx,
      { id: "app-1", name: "first" },
      false,
    );

    created.resolve();
    const result = await resultPromise;

    jestExpect(result).toEqual([undefined]);
  });
});
