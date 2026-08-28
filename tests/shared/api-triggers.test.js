"use strict";

const triggersApi = require("../../shared/api/triggers");

function sdkList(items) {
  return { all: () => Promise.resolve(items) };
}

describe("listTriggersForApplication", () => {
  it("combines cron and message triggers into a single list", async () => {
    const ctx = {
      sdkApi: {
        listCrons: () => sdkList([{ id: "cron-1" }]),
        listTriggers: () => sdkList([{ id: "trigger-1" }]),
      },
    };

    const result = await triggersApi.listTriggersForApplication.call(
      ctx,
      "app-1",
      true,
    );

    expect(result).toEqual([{ id: "cron-1" }, { id: "trigger-1" }]);
  });

  it("queries with functionId when isFunction is true", async () => {
    const seenRequests = [];
    const ctx = {
      sdkApi: {
        listCrons: (request) => {
          seenRequests.push(request);
          return sdkList([]);
        },
        listTriggers: (request) => {
          seenRequests.push(request);
          return sdkList([]);
        },
      },
    };

    await triggersApi.listTriggersForApplication.call(ctx, "app-1", true);

    expect(seenRequests).toEqual([
      { functionId: "app-1" },
      { functionId: "app-1" },
    ]);
  });

  it("queries with containerId when isFunction is false", async () => {
    const seenRequests = [];
    const ctx = {
      sdkApi: {
        listCrons: (request) => {
          seenRequests.push(request);
          return sdkList([]);
        },
        listTriggers: (request) => {
          seenRequests.push(request);
          return sdkList([]);
        },
      },
    };

    await triggersApi.listTriggersForApplication.call(ctx, "app-1", false);

    expect(seenRequests).toEqual([
      { containerId: "app-1" },
      { containerId: "app-1" },
    ]);
  });

  it("returns an empty list when the application has no triggers at all", async () => {
    const ctx = {
      sdkApi: {
        listCrons: () => sdkList([]),
        listTriggers: () => sdkList([]),
      },
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
      sdkApi: {
        listCrons: () => ({
          all: () => Promise.reject(new Error("boom")),
        }),
        listTriggers: () => sdkList([]),
      },
    };

    await expect(
      triggersApi.listTriggersForApplication.call(ctx, "app-1", true),
    ).rejects.toThrow("boom");
  });
});

describe("createCronTrigger", () => {
  it("builds the request with functionId when isFunction is true", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createCron: (request) => {
          capturedRequest = request;
          return Promise.resolve({ id: "cron-1" });
        },
      },
    };

    await triggersApi.createCronTrigger.call(ctx, "app-1", true, {
      schedule: "0 0 * * *",
    });

    expect(capturedRequest).toEqual({
      schedule: "0 0 * * *",
      args: undefined,
      functionId: "app-1",
    });
  });

  it("builds the request with containerId when isFunction is false", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createCron: (request) => {
          capturedRequest = request;
          return Promise.resolve({ id: "cron-1" });
        },
      },
    };

    await triggersApi.createCronTrigger.call(ctx, "app-1", false, {
      schedule: "0 0 * * *",
    });

    expect(capturedRequest).toEqual({
      schedule: "0 0 * * *",
      args: undefined,
      containerId: "app-1",
    });
  });
});

describe("createMessageTrigger", () => {
  it("builds the request with containerId and a mapped scwSqsConfig when isFunction is false", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createTrigger: (request) => {
          capturedRequest = request;
          return Promise.resolve({ id: "trigger-1" });
        },
      },
    };

    await triggersApi.createMessageTrigger.call(ctx, "app-1", false, {
      name: "my-trigger",
      scw_sqs_config: {
        queue: "my-queue",
        mnq_project_id: "proj-1",
        mnq_region: "fr-par",
      },
    });

    expect(capturedRequest).toEqual({
      name: "my-trigger",
      containerId: "app-1",
      scwSqsConfig: {
        queue: "my-queue",
        mnqProjectId: "proj-1",
        mnqRegion: "fr-par",
      },
    });
  });

  it("builds the request with a mapped scwNatsConfig", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createTrigger: (request) => {
          capturedRequest = request;
          return Promise.resolve({ id: "trigger-1" });
        },
      },
    };

    await triggersApi.createMessageTrigger.call(ctx, "app-1", true, {
      name: "my-trigger",
      scw_nats_config: {
        subject: "my.subject",
        mnq_nats_account_id: "acct-1",
        mnq_project_id: "proj-1",
        mnq_region: "fr-par",
      },
    });

    expect(capturedRequest).toEqual({
      name: "my-trigger",
      functionId: "app-1",
      scwNatsConfig: {
        subject: "my.subject",
        mnqNatsAccountId: "acct-1",
        mnqProjectId: "proj-1",
        mnqRegion: "fr-par",
      },
    });
  });
});
