const validate = require("../../shared/validate");
const { describe, beforeEach, it, expect } = require("@jest/globals");

class MockProvider {
  constructor() {
    this.serverless = {
      service: {
        functions: {},
        custom: {
          containers: {},
        },
      },
    };
  }

  addFunction(funcName) {
    this.serverless.service.functions[funcName] = {};
  }

  addContainer(contName) {
    this.serverless.service.custom.containers[contName] = {};
  }
}

describe("Configuration validation test", () => {
  // Add validation to this object
  Object.assign(this, validate);

  this.provider = null;
  beforeEach(() => {
    // Set up new dummy provider
    this.provider = new MockProvider();
  });

  it("Should validate a container when it is defined", () => {
    this.provider.addContainer("foobar");

    expect(this.isDefinedFunction("foobar")).toEqual(false);
    expect(this.isDefinedContainer("foobar")).toEqual(true);
    expect(this.isDefinedFunction("baz")).toEqual(false);
    expect(this.isDefinedContainer("baz")).toEqual(false);
  });

  it("Should validate a function when it is defined", () => {
    this.provider.addFunction("qux");

    expect(this.isDefinedFunction("qux")).toEqual(true);
    expect(this.isDefinedContainer("qux")).toEqual(false);
    expect(this.isDefinedFunction("baz")).toEqual(false);
    expect(this.isDefinedContainer("baz")).toEqual(false);
  });

  it("Should not validate a container when none are defined", () => {
    expect(this.isDefinedContainer("qux")).toEqual(false);
  });

  it("Should not validate a function when none are defined", () => {
    expect(this.isDefinedFunction("qux")).toEqual(false);
  });

  describe("SQS trigger validation", () => {
    it("Should validate a valid SQS trigger", () => {
      const validTrigger = {
        name: "my-sqs-trigger",
        queue: "my-queue-name",
        projectId: "12345678-1234-1234-1234-123456789012",
        region: "fr-par",
      };

      expect(() =>
        this.validateTriggers([{ sqs: validTrigger }]),
      ).not.toThrow();
    });

    it("Should validate SQS trigger without optional fields", () => {
      const validTrigger = {
        name: "my-sqs-trigger",
        queue: "my-queue-name",
      };

      expect(() =>
        this.validateTriggers([{ sqs: validTrigger }]),
      ).not.toThrow();
    });

    it("Should reject SQS trigger with invalid name", () => {
      const invalidTrigger = {
        name: "a", // too short
        queue: "my-queue-name",
      };

      const errors = this.validateTriggers([{ sqs: invalidTrigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid trigger "a": name is invalid');
    });

    it("Should reject SQS trigger with invalid queue name", () => {
      const invalidTrigger = {
        name: "my-sqs-trigger",
        queue: "a", // too short
      };

      const errors = this.validateTriggers([{ sqs: invalidTrigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        'Invalid trigger "my-sqs-trigger": queue is invalid',
      );
    });

    it("Should reject SQS trigger with invalid projectId", () => {
      const invalidTrigger = {
        name: "my-sqs-trigger",
        queue: "my-queue-name",
        projectId: "invalid-project-id",
      };

      const errors = this.validateTriggers([{ sqs: invalidTrigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        'Invalid trigger "my-sqs-trigger": projectId is invalid',
      );
    });

    it("Should reject SQS trigger with invalid region", () => {
      const invalidTrigger = {
        name: "my-sqs-trigger",
        queue: "my-queue-name",
        region: "invalid-region",
      };

      const errors = this.validateTriggers([{ sqs: invalidTrigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        'Invalid trigger "my-sqs-trigger": region is unknown',
      );
    });

    it("Should reject SQS trigger without name", () => {
      const invalidTrigger = {
        queue: "my-queue-name",
      };

      const errors = this.validateTriggers([{ sqs: invalidTrigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(": name is invalid");
    });

    it("Should reject SQS trigger without queue", () => {
      const invalidTrigger = {
        name: "my-sqs-trigger",
      };

      const errors = this.validateTriggers([{ sqs: invalidTrigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        'Invalid trigger "my-sqs-trigger": queue is invalid',
      );
    });
  });

  describe("schedule trigger validation", () => {
    it("Should validate a valid cron schedule", () => {
      expect(() =>
        this.validateTriggers([{ schedule: { rate: "1 * * * *" } }]),
      ).not.toThrow();
    });

    it("Should reject a malformed cron schedule", () => {
      const errors = this.validateTriggers([
        { schedule: { rate: "not-a-cron" } },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Trigger Schedule is invalid");
    });

    it("Should reject a schedule trigger with no rate at all", () => {
      const errors = this.validateTriggers([{ schedule: {} }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Trigger Schedule is invalid");
    });
  });

  describe("nats trigger validation", () => {
    function validNatsTrigger(overrides) {
      return {
        name: "my-nats-trigger",
        scw_nats_config: {
          subject: "my.subject",
          mnq_nats_account_id: "A".repeat(56),
          mnq_project_id: "12345678-1234-1234-1234-123456789012",
          mnq_region: "fr-par",
        },
        ...overrides,
      };
    }

    it("Should validate a fully valid nats trigger", () => {
      expect(() =>
        this.validateTriggers([{ nats: validNatsTrigger() }]),
      ).not.toThrow();
    });

    it("Should reject a nats trigger with an invalid name", () => {
      const errors = this.validateTriggers([
        { nats: validNatsTrigger({ name: "a" }) },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("name is invalid");
    });

    it("Should reject a nats trigger missing scw_nats_config entirely", () => {
      const trigger = validNatsTrigger();
      delete trigger.scw_nats_config;

      const errors = this.validateTriggers([{ nats: trigger }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("scw_nats_config is missing");
    });

    it("Should reject a nats trigger with an invalid subject", () => {
      const errors = this.validateTriggers([
        {
          nats: validNatsTrigger({
            scw_nats_config: {
              ...validNatsTrigger().scw_nats_config,
              subject: "",
            },
          }),
        },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("scw_nats_config.subject is invalid");
    });

    it("Should reject a nats trigger with an invalid mnq_nats_account_id", () => {
      const errors = this.validateTriggers([
        {
          nats: validNatsTrigger({
            scw_nats_config: {
              ...validNatsTrigger().scw_nats_config,
              mnq_nats_account_id: "too-short",
            },
          }),
        },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        "scw_nats_config.mnq_nats_account_id is invalid",
      );
    });

    it("Should reject a nats trigger with an invalid mnq_project_id", () => {
      const errors = this.validateTriggers([
        {
          nats: validNatsTrigger({
            scw_nats_config: {
              ...validNatsTrigger().scw_nats_config,
              mnq_project_id: "not-a-uuid",
            },
          }),
        },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("scw_nats_config.mnq_project_id is invalid");
    });

    it("Should reject a nats trigger with an unknown mnq_region", () => {
      const errors = this.validateTriggers([
        {
          nats: validNatsTrigger({
            scw_nats_config: {
              ...validNatsTrigger().scw_nats_config,
              mnq_region: "us-east-1",
            },
          }),
        },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("scw_nats_config.region is unknown");
    });
  });

  describe("validateTriggers - unsupported/malformed trigger shapes", () => {
    it("Should reject a trigger object with more than one key", () => {
      const errors = this.validateTriggers([
        { schedule: { rate: "1 * * * *" }, nats: {} },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        "should contain at least one event type configuration",
      );
    });

    it("Should reject a trigger type that isn't schedule/nats/sqs", () => {
      const errors = this.validateTriggers([{ http: {} }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        "Trigger Type http is not currently supported",
      );
    });
  });
});

describe("validateEnv", () => {
  it("returns no errors for a valid string-only map", () => {
    const errors = validate.validateEnv.call({}, { FOO: "bar", BAZ: "qux" });
    expect(errors).toEqual([]);
  });

  it("returns no errors and no crash when variables is undefined", () => {
    const errors = validate.validateEnv.call({}, undefined);
    expect(errors).toEqual([]);
  });

  it("throws when variables is not an object at all", () => {
    expect(() => validate.validateEnv.call({}, "not-an-object")).toThrow(
      /map of strings/,
    );
  });

  it("flags individual non-string values instead of throwing", () => {
    const errors = validate.validateEnv.call(
      {},
      { FOO: "bar", COUNT: 42, ENABLED: true },
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("COUNT");
    expect(errors[1]).toContain("ENABLED");
  });
});

describe("validateApplications - functions/containers mutual exclusivity", () => {
  function ctxWith(functions, containers) {
    return {
      ...validate,
      runtime: "node18",
      serverless: {
        service: {
          functions,
          custom: { containers },
        },
      },
    };
  }

  it("rejects a service that defines both functions and custom.containers", async () => {
    const ctx = ctxWith(
      { first: { runtime: "go118", events: [] } },
      { second: { events: [] } },
    );

    const errors = await validate.validateApplications.call(ctx, []);

    expect(errors.some((e) => e.includes("cannot define both"))).toBe(true);
  });

  it("does not flag a functions-only config", async () => {
    const ctx = ctxWith({ first: { runtime: "go118", events: [] } }, {});

    const errors = await validate.validateApplications.call(ctx, []);

    expect(errors.some((e) => e.includes("cannot define both"))).toBe(false);
  });

  it("does not flag a containers-only config", async () => {
    const ctx = ctxWith({}, { second: { events: [] } });

    const errors = await validate.validateApplications.call(ctx, []);

    expect(errors.some((e) => e.includes("cannot define both"))).toBe(false);
  });

  it("still flags the neither-defined case with its own message", async () => {
    const ctx = ctxWith({}, {});

    const errors = await validate.validateApplications.call(ctx, []);

    expect(errors.some((e) => e.includes("must define at least one"))).toBe(
      true,
    );
    expect(errors.some((e) => e.includes("cannot define both"))).toBe(false);
  });
});

describe("validateCredentials", () => {
  function ctxWith(scwToken, scwProject) {
    return {
      provider: {
        scwToken,
        getScwProject: () => scwProject,
      },
    };
  }

  it("passes with a valid 36-char token and project", () => {
    expect(() =>
      validate.validateCredentials.call(
        ctxWith("a".repeat(36), "b".repeat(36)),
      ),
    ).not.toThrow();
  });

  it("throws the friendly error, not a TypeError, when only scwToken is set", () => {
    expect(() =>
      validate.validateCredentials.call(ctxWith("a".repeat(36), undefined)),
    ).toThrow(/scwToken.*scwProject.*invalid/i);
  });

  it("throws the friendly error, not a TypeError, when only scwProject is set", () => {
    expect(() =>
      validate.validateCredentials.call(ctxWith(undefined, "b".repeat(36))),
    ).toThrow(/scwToken.*scwProject.*invalid/i);
  });

  it("throws the friendly error when neither is set", () => {
    expect(() =>
      validate.validateCredentials.call(ctxWith(undefined, undefined)),
    ).toThrow(/scwToken.*scwProject.*invalid/i);
  });

  it("throws when a token/project is set but the wrong length", () => {
    expect(() =>
      validate.validateCredentials.call(ctxWith("too-short", "b".repeat(36))),
    ).toThrow(/scwToken.*scwProject.*invalid/i);
  });
});

describe("validate (full orchestration chain)", () => {
  function validCtx() {
    return {
      ...validate,
      serverless: {
        config: { servicePath: "/some/service" },
        service: {
          provider: {},
          functions: { first: { runtime: "go118", events: [] } },
        },
      },
      provider: {
        scwToken: "a".repeat(36),
        getScwProject: () => "b".repeat(36),
        scwRegion: "fr-par",
      },
      runtime: "go118",
    };
  }

  it("resolves cleanly end-to-end when every step passes", async () => {
    await expect(validate.validate.call(validCtx())).resolves.toBeUndefined();
  });

  it("short-circuits the rest of the chain on an early failure (servicePath)", async () => {
    const ctx = validCtx();
    ctx.serverless.config.servicePath = undefined;

    await expect(validate.validate.call(ctx)).rejects.toThrow(
      /service directory/,
    );
  });

  it("threads accumulated errors through to checkErrors and rejects with them", async () => {
    const ctx = validCtx();
    // Break validateApplications (both functions and containers empty) so
    // an application error actually reaches checkErrors via the chain.
    ctx.serverless.service.functions = {};

    await expect(validate.validate.call(ctx)).rejects.toEqual(
      expect.arrayContaining([expect.stringContaining("at least one")]),
    );
  });
});
