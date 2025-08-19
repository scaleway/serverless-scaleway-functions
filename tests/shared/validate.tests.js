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
        this.validateTriggers([{ sqs: validTrigger }])
      ).not.toThrow();
    });

    it("Should validate SQS trigger without optional fields", () => {
      const validTrigger = {
        name: "my-sqs-trigger",
        queue: "my-queue-name",
      };

      expect(() =>
        this.validateTriggers([{ sqs: validTrigger }])
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
        'Invalid trigger "my-sqs-trigger": queue is invalid'
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
        'Invalid trigger "my-sqs-trigger": projectId is invalid'
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
        'Invalid trigger "my-sqs-trigger": region is unknown'
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
        'Invalid trigger "my-sqs-trigger": queue is invalid'
      );
    });
  });
});
