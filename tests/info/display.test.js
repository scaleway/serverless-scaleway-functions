"use strict";

const {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
} = require("@jest/globals");

const display = require("../../info/lib/display");

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("displayInfo", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("does nothing when the namespace doesn't exist (undefined)", async () => {
    const ctx = {
      serverless: { configurationInput: { service: "my-service" } },
      provider: { getScwProject: () => "proj" },
      getNamespaceFromList: () => Promise.resolve(undefined),
      listContainers: jest.fn(),
      listFunctions: jest.fn(),
    };

    display.displayInfo.call(ctx);
    await flushPromises();

    expect(ctx.listContainers).not.toHaveBeenCalled();
    expect(ctx.listFunctions).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the namespace has no id", async () => {
    const ctx = {
      serverless: { configurationInput: { service: "my-service" } },
      provider: { getScwProject: () => "proj" },
      getNamespaceFromList: () => Promise.resolve({ id: null }),
      listContainers: jest.fn(),
      listFunctions: jest.fn(),
    };

    display.displayInfo.call(ctx);
    await flushPromises();

    expect(ctx.listContainers).not.toHaveBeenCalled();
    expect(ctx.listFunctions).not.toHaveBeenCalled();
  });

  it("lists functions and prints them keyed by name when no containers are configured", async () => {
    const ctx = {
      serverless: {
        configurationInput: { service: "my-service", custom: {} },
      },
      provider: { getScwProject: () => "proj" },
      getNamespaceFromList: () => Promise.resolve({ id: "ns-1" }),
      listContainers: jest.fn(),
      listFunctions: () =>
        Promise.resolve([
          { name: "funcA", status: "ready" },
          { name: "funcB", status: "ready" },
        ]),
    };

    display.displayInfo.call(ctx);
    await flushPromises();

    expect(ctx.listContainers).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain("funcA:");
    expect(output).toContain("funcB:");
    expect(output).toContain("functions:");
  });

  it("lists containers instead of functions when custom.containers is configured", async () => {
    const ctx = {
      serverless: {
        configurationInput: {
          service: "my-service",
          custom: { containers: { web: {} } },
        },
      },
      provider: { getScwProject: () => "proj" },
      getNamespaceFromList: () => Promise.resolve({ id: "ns-1" }),
      listContainers: () => Promise.resolve([{ name: "web", status: "ready" }]),
      listFunctions: jest.fn(),
    };

    display.displayInfo.call(ctx);
    await flushPromises();

    expect(ctx.listFunctions).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain("web:");
    expect(output).toContain("containers:");
  });

  it("falls back to listing functions when custom.containers is present but empty", async () => {
    const ctx = {
      serverless: {
        configurationInput: {
          service: "my-service",
          custom: { containers: {} },
        },
      },
      provider: { getScwProject: () => "proj" },
      getNamespaceFromList: () => Promise.resolve({ id: "ns-1" }),
      listContainers: jest.fn(),
      listFunctions: () =>
        Promise.resolve([{ name: "funcA", status: "ready" }]),
    };

    display.displayInfo.call(ctx);
    await flushPromises();

    expect(ctx.listContainers).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });
});
