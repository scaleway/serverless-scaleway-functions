const { expect } = require('chai');

const validate = require('../../shared/validate');

class MockProvider {
  constructor() {
    this.serverless = {
      service: {
        functions: {},
        custom: {
          containers: {},
        }
      }
    };
  };

  addFunction(funcName) {
    this.serverless.service.functions[funcName] = {};
  };

  addContainer(contName) {
    this.serverless.service.custom.containers[contName] = {};
  };
}

describe('Configuration validation test', () => {
  // Add validation to this object
  Object.assign(
      this,
      validate
  );

  this.provider = null;
  beforeEach(() => {
    // Set up new dummy provider
    this.provider = new MockProvider();
  });

  it('Should validate a container when it is defined', () => {
    this.provider.addContainer("foobar");

    expect(this.isDefinedFunction("foobar")).to.equal(false);
    expect(this.isDefinedContainer("foobar")).to.equal(true);
    expect(this.isDefinedFunction("baz")).to.equal(false);
    expect(this.isDefinedContainer("baz")).to.equal(false);
  });

  it('Should validate a function when it is defined', () => {
    this.provider.addFunction("qux");

    expect(this.isDefinedFunction("qux")).to.equal(true);
    expect(this.isDefinedContainer("qux")).to.equal(false);
    expect(this.isDefinedFunction("baz")).to.equal(false);
    expect(this.isDefinedContainer("baz")).to.equal(false);
  });

  it('Should not validate a container when none are defined', () => {
    expect(this.isDefinedContainer("qux")).to.equal(false);
  });

  it('Should not validate a function when none are defined', () => {
    expect(this.isDefinedFunction("qux")).to.equal(false);
  });
});
