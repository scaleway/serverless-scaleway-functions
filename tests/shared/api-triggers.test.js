"use strict";

jest.mock("../../shared/api/mnq");
const MnqApi = require("../../shared/api/mnq");
const triggersApi = require("../../shared/api/triggers");

function sdkList(items) {
  return { all: () => Promise.resolve(items) };
}

function fakeProvider() {
  return {
    mnqApiUrl: "https://api.scaleway.com/mnq/v1beta1/regions/fr-par/",
    scwToken: "token",
    getScwProject: () => "proj-1",
    getScwRegion: () => "fr-par",
  };
}

beforeEach(() => {
  MnqApi.mockClear();
});

describe("listTriggersForApplication", () => {
  it("combines cron and message triggers into a single list for Functions", async () => {
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

  // Containers (v1): cron, sqs and nats all come back from one listTriggers
  // call now (no more separate listCrons) - a cron-sourced trigger gets a
  // synthesized top-level `.schedule` so deploy/lib/deployTriggers.ts's
  // `"schedule" in trigger` branch keeps working unchanged.
  it("queries with containerId only, and tags cron-sourced triggers with .schedule, when isFunction is false", async () => {
    const seenRequests = [];
    const ctx = {
      sdkApi: {
        listCrons: () => {
          throw new Error("listCrons doesn't exist on Containerv1.API");
        },
        listTriggers: (request) => {
          seenRequests.push(request);
          return sdkList([
            {
              id: "trigger-1",
              sourceType: "cron",
              cronConfig: { schedule: "0 0 * * *" },
            },
            { id: "trigger-2", sourceType: "sqs" },
          ]);
        },
      },
    };

    const result = await triggersApi.listTriggersForApplication.call(
      ctx,
      "app-1",
      false,
    );

    expect(seenRequests).toEqual([{ containerId: "app-1" }]);
    expect(result).toEqual([
      {
        id: "trigger-1",
        sourceType: "cron",
        cronConfig: { schedule: "0 0 * * *" },
        schedule: "0 0 * * *",
      },
      { id: "trigger-2", sourceType: "sqs" },
    ]);
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

  // Containers (v1): cron is now sourceType 'cron' + cronConfig on a named
  // Trigger, created via createTrigger - not a separate Cron resource.
  it("builds a sourceType:'cron' Trigger with the schedule.input JSON-encoded into cronConfig.body, when isFunction is false", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createTrigger: (request) => {
          capturedRequest = request;
          return Promise.resolve({ id: "trigger-1" });
        },
      },
    };

    await triggersApi.createCronTrigger.call(ctx, "app-1", false, {
      name: "cron-0",
      schedule: "0 0 * * *",
      args: { key: "value" },
    });

    expect(capturedRequest).toEqual({
      containerId: "app-1",
      name: "cron-0",
      cronConfig: {
        schedule: "0 0 * * *",
        timezone: "UTC",
        body: JSON.stringify({ key: "value" }),
        headers: {},
      },
    });
  });
});

describe("createMessageTrigger", () => {
  it("builds the request with a mapped scwSqsConfig when isFunction is true (Functions, Scaleway-managed)", async () => {
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
      scw_sqs_config: {
        queue: "my-queue",
        mnq_project_id: "proj-1",
        mnq_region: "fr-par",
      },
    });

    expect(capturedRequest).toEqual({
      name: "my-trigger",
      functionId: "app-1",
      scwSqsConfig: {
        queue: "my-queue",
        mnqProjectId: "proj-1",
        mnqRegion: "fr-par",
      },
    });
  });

  it("builds the request with a mapped scwNatsConfig when isFunction is true (Functions, Scaleway-managed)", async () => {
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

  // Containers (v1): sqsConfig/natsConfig need real, bring-your-own
  // credentials - minted fresh via MnqApi rather than the Scaleway-managed
  // scw_sqs_config/scw_nats_config Functions still use.
  it("mints a fresh SQS credential via MnqApi and builds a sourceType:'sqs' Trigger, when isFunction is false", async () => {
    let capturedRequest;
    const createSqsCredentials = jest
      .fn()
      .mockResolvedValue({ accessKey: "AK", secretKey: "SK" });
    const ensureSqsActivated = jest
      .fn()
      .mockResolvedValue("https://sqs.mnq.fr-par.scaleway.com/proj-1");
    MnqApi.mockImplementation(() => ({
      ensureSqsActivated,
      createSqsCredentials,
    }));
    const ctx = {
      provider: fakeProvider(),
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

    expect(ensureSqsActivated).toHaveBeenCalledWith("proj-1");
    expect(createSqsCredentials).toHaveBeenCalledWith(
      "proj-1",
      "app-1-my-trigger",
    );
    expect(capturedRequest).toEqual({
      containerId: "app-1",
      name: "my-trigger",
      sqsConfig: {
        region: "fr-par",
        endpoint: "https://sqs.mnq.fr-par.scaleway.com/proj-1",
        accessKeyId: "AK",
        secretAccessKey: "SK",
        queueUrl: "https://sqs.mnq.fr-par.scaleway.com/proj-1/my-queue",
      },
    });
  });

  it("builds the MnqApi client for the trigger's own mnq_region, not the deploy region", async () => {
    MnqApi.mockImplementation(() => ({
      ensureSqsActivated: jest
        .fn()
        .mockResolvedValue("https://sqs.mnq.nl-ams.scaleway.com/proj-1"),
      createSqsCredentials: jest
        .fn()
        .mockResolvedValue({ accessKey: "AK", secretKey: "SK" }),
    }));
    const ctx = {
      provider: fakeProvider(), // getScwRegion() => "fr-par"
      sdkApi: { createTrigger: () => Promise.resolve({ id: "trigger-1" }) },
    };

    await triggersApi.createMessageTrigger.call(ctx, "app-1", false, {
      name: "my-trigger",
      scw_sqs_config: {
        queue: "my-queue",
        mnq_project_id: "proj-1",
        mnq_region: "nl-ams",
      },
    });

    expect(MnqApi).toHaveBeenCalledWith(
      expect.stringContaining("nl-ams"),
      "token",
    );
  });

  it("activates Queues before creating credentials, rather than racing the two", async () => {
    const order = [];
    MnqApi.mockImplementation(() => ({
      ensureSqsActivated: jest.fn().mockImplementation(async () => {
        order.push("activate-start");
        await Promise.resolve();
        order.push("activate-end");
        return "https://sqs.mnq.fr-par.scaleway.com/proj-1";
      }),
      createSqsCredentials: jest.fn().mockImplementation(async () => {
        order.push("create-credentials");
        return { accessKey: "AK", secretKey: "SK" };
      }),
    }));
    const ctx = {
      provider: fakeProvider(),
      sdkApi: { createTrigger: () => Promise.resolve({ id: "trigger-1" }) },
    };

    await triggersApi.createMessageTrigger.call(ctx, "app-1", false, {
      name: "my-trigger",
      scw_sqs_config: {
        queue: "my-queue",
        mnq_project_id: "proj-1",
        mnq_region: "fr-par",
      },
    });

    expect(order).toEqual([
      "activate-start",
      "activate-end",
      "create-credentials",
    ]);
  });

  it("mints a fresh NATS credential via MnqApi and builds a sourceType:'nats' Trigger, when isFunction is false", async () => {
    let capturedRequest;
    const createNatsCredentials = jest.fn().mockResolvedValue({
      credentials: { name: "c", content: "creds-file-content" },
    });
    const getNatsAccountEndpoint = jest
      .fn()
      .mockResolvedValue("nats://nats.mnq.fr-par.scaleway.com:4222");
    MnqApi.mockImplementation(() => ({
      getNatsAccountEndpoint,
      createNatsCredentials,
    }));
    const ctx = {
      provider: fakeProvider(),
      sdkApi: {
        createTrigger: (request) => {
          capturedRequest = request;
          return Promise.resolve({ id: "trigger-1" });
        },
      },
    };

    await triggersApi.createMessageTrigger.call(ctx, "app-1", false, {
      name: "my-trigger",
      scw_nats_config: {
        subject: "my.subject",
        mnq_nats_account_id: "acct-1",
      },
    });

    expect(getNatsAccountEndpoint).toHaveBeenCalledWith("acct-1");
    expect(createNatsCredentials).toHaveBeenCalledWith(
      "acct-1",
      "app-1-my-trigger",
    );
    expect(capturedRequest).toEqual({
      containerId: "app-1",
      name: "my-trigger",
      natsConfig: {
        serverUrls: ["nats://nats.mnq.fr-par.scaleway.com:4222"],
        subject: "my.subject",
        credentialsFileContent: "creds-file-content",
      },
    });
  });
});

describe("deleteCronTrigger", () => {
  it("calls deleteCron for Functions", async () => {
    const deleteCron = jest.fn().mockResolvedValue({ id: "cron-1" });
    const ctx = { sdkApi: { deleteCron } };

    await triggersApi.deleteCronTrigger.call(ctx, "cron-1", true);

    expect(deleteCron).toHaveBeenCalledWith({ cronId: "cron-1" });
  });

  it("calls deleteTrigger for Containers, since cron is just a Trigger there", async () => {
    const deleteTrigger = jest.fn().mockResolvedValue({ id: "trigger-1" });
    const ctx = { sdkApi: { deleteTrigger } };

    await triggersApi.deleteCronTrigger.call(ctx, "trigger-1", false);

    expect(deleteTrigger).toHaveBeenCalledWith({ triggerId: "trigger-1" });
  });
});

describe("deleteMessageTrigger", () => {
  it("deletes the trigger without touching MnqApi for Functions", async () => {
    const deleteTrigger = jest.fn().mockResolvedValue({ id: "trigger-1" });
    const ctx = { sdkApi: { deleteTrigger } };

    await triggersApi.deleteMessageTrigger.call(
      ctx,
      { id: "trigger-1", sourceType: "sqs" },
      true,
    );

    expect(deleteTrigger).toHaveBeenCalledWith({ triggerId: "trigger-1" });
    expect(MnqApi).not.toHaveBeenCalled();
  });

  it("deletes the paired SQS credential by its deterministic name before deleting a Container sqs trigger", async () => {
    const deleteSqsCredentialsByName = jest.fn().mockResolvedValue(undefined);
    MnqApi.mockImplementation(() => ({ deleteSqsCredentialsByName }));
    const deleteTrigger = jest.fn().mockResolvedValue({ id: "trigger-1" });
    const ctx = { provider: fakeProvider(), sdkApi: { deleteTrigger } };

    await triggersApi.deleteMessageTrigger.call(
      ctx,
      {
        id: "trigger-1",
        name: "my-trigger",
        containerId: "app-1",
        sourceType: "sqs",
      },
      false,
    );

    expect(deleteSqsCredentialsByName).toHaveBeenCalledWith(
      "proj-1",
      "app-1-my-trigger",
    );
  });

  it("recovers the credential's own region from trigger.sqsConfig.region rather than always using the deploy region", async () => {
    const deleteSqsCredentialsByName = jest.fn().mockResolvedValue(undefined);
    MnqApi.mockImplementation(() => ({ deleteSqsCredentialsByName }));
    const deleteTrigger = jest.fn().mockResolvedValue({ id: "trigger-1" });
    const ctx = { provider: fakeProvider(), sdkApi: { deleteTrigger } }; // getScwRegion() => "fr-par"

    await triggersApi.deleteMessageTrigger.call(
      ctx,
      {
        id: "trigger-1",
        name: "my-trigger",
        containerId: "app-1",
        sourceType: "sqs",
        sqsConfig: { region: "nl-ams" },
      },
      false,
    );

    expect(MnqApi).toHaveBeenCalledWith(
      expect.stringContaining("nl-ams"),
      "token",
    );
    expect(deleteTrigger).toHaveBeenCalledWith({ triggerId: "trigger-1" });
  });

  it("deletes the paired NATS credential by its deterministic name before deleting a Container nats trigger", async () => {
    const deleteNatsCredentialsByName = jest.fn().mockResolvedValue(undefined);
    MnqApi.mockImplementation(() => ({ deleteNatsCredentialsByName }));
    const deleteTrigger = jest.fn().mockResolvedValue({ id: "trigger-1" });
    const ctx = { provider: fakeProvider(), sdkApi: { deleteTrigger } };

    await triggersApi.deleteMessageTrigger.call(
      ctx,
      {
        id: "trigger-1",
        name: "my-trigger",
        containerId: "app-1",
        sourceType: "nats",
      },
      false,
    );

    expect(deleteNatsCredentialsByName).toHaveBeenCalledWith(
      "proj-1",
      "app-1-my-trigger",
    );
    expect(deleteTrigger).toHaveBeenCalledWith({ triggerId: "trigger-1" });
  });

  it("does not touch MnqApi for a Container cron trigger", async () => {
    const deleteTrigger = jest.fn().mockResolvedValue({ id: "trigger-1" });
    const ctx = { provider: fakeProvider(), sdkApi: { deleteTrigger } };

    await triggersApi.deleteMessageTrigger.call(
      ctx,
      { id: "trigger-1", name: "cron-0", containerId: "app-1" },
      false,
    );

    expect(MnqApi).not.toHaveBeenCalled();
    expect(deleteTrigger).toHaveBeenCalledWith({ triggerId: "trigger-1" });
  });
});
