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
});
