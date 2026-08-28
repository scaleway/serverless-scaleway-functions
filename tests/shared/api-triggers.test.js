"use strict";

const { expect, describe, it } = require("@jest/globals");

const triggersApi = require("../../shared/api/triggers");

function apiManagerReturning(responsesByUrl) {
  return {
    get: (url) => {
      const entry = Object.entries(responsesByUrl).find(([prefix]) =>
        url.startsWith(prefix),
      );
      if (!entry) {
        return Promise.reject(new Error(`unexpected URL: ${url}`));
      }
      const [, data] = entry;
      if (data instanceof Error) {
        return Promise.reject(data);
      }
      return Promise.resolve({ data });
    },
  };
}

describe("listTriggersForApplication", () => {
  it("combines cron and message triggers into a single list", async () => {
    const ctx = {
      apiManager: apiManagerReturning({
        crons: { crons: [{ id: "cron-1" }] },
        triggers: { triggers: [{ id: "trigger-1" }] },
      }),
    };

    const result = await triggersApi.listTriggersForApplication.call(
      ctx,
      "app-1",
      true,
    );

    expect(result).toEqual([{ id: "cron-1" }, { id: "trigger-1" }]);
  });

  it("queries with function_id when isFunction is true", async () => {
    const seenUrls = [];
    const ctx = {
      apiManager: {
        get: (url) => {
          seenUrls.push(url);
          return Promise.resolve({ data: { crons: [], triggers: [] } });
        },
      },
    };

    await triggersApi.listTriggersForApplication.call(ctx, "app-1", true);

    expect(seenUrls).toEqual([
      "crons?function_id=app-1",
      "triggers?function_id=app-1",
    ]);
  });

  it("queries with container_id when isFunction is false", async () => {
    const seenUrls = [];
    const ctx = {
      apiManager: {
        get: (url) => {
          seenUrls.push(url);
          return Promise.resolve({ data: { crons: [], triggers: [] } });
        },
      },
    };

    await triggersApi.listTriggersForApplication.call(ctx, "app-1", false);

    expect(seenUrls).toEqual([
      "crons?container_id=app-1",
      "triggers?container_id=app-1",
    ]);
  });

  it("returns an empty list when the application has no triggers at all", async () => {
    const ctx = {
      apiManager: apiManagerReturning({
        crons: { crons: [] },
        triggers: { triggers: [] },
      }),
    };

    const result = await triggersApi.listTriggersForApplication.call(
      ctx,
      "app-1",
      true,
    );

    expect(result).toEqual([]);
  });

  it("propagates an API error instead of returning a partial/undefined list", async () => {
    const ctx = {
      apiManager: {
        get: (url) => {
          if (url.startsWith("crons")) {
            const err = new Error("http error");
            err.response = { data: { message: "boom" } };
            return Promise.reject(err);
          }
          return Promise.resolve({ data: { triggers: [] } });
        },
      },
    };

    await expect(
      triggersApi.listTriggersForApplication.call(ctx, "app-1", true),
    ).rejects.toThrow("boom");
  });
});

describe("createCronTrigger", () => {
  it("builds the payload with function_id when isFunction is true", async () => {
    let capturedPayload;
    const ctx = {
      apiManager: {
        post: (url, payload) => {
          capturedPayload = payload;
          return Promise.resolve({ data: { id: "cron-1" } });
        },
      },
    };

    await triggersApi.createCronTrigger.call(ctx, "app-1", true, {
      schedule: "0 0 * * *",
    });

    expect(capturedPayload).toEqual({
      schedule: "0 0 * * *",
      function_id: "app-1",
    });
  });

  it("builds the payload with container_id when isFunction is false", async () => {
    let capturedPayload;
    const ctx = {
      apiManager: {
        post: (url, payload) => {
          capturedPayload = payload;
          return Promise.resolve({ data: { id: "cron-1" } });
        },
      },
    };

    await triggersApi.createCronTrigger.call(ctx, "app-1", false, {
      schedule: "0 0 * * *",
    });

    expect(capturedPayload).toEqual({
      schedule: "0 0 * * *",
      container_id: "app-1",
    });
  });
});

describe("createMessageTrigger", () => {
  it("builds the payload with container_id when isFunction is false", async () => {
    let capturedPayload;
    const ctx = {
      apiManager: {
        post: (url, payload) => {
          capturedPayload = payload;
          return Promise.resolve({ data: { id: "trigger-1" } });
        },
      },
    };

    await triggersApi.createMessageTrigger.call(ctx, "app-1", false, {
      queue: "my-queue",
    });

    expect(capturedPayload).toEqual({
      queue: "my-queue",
      container_id: "app-1",
    });
  });
});
