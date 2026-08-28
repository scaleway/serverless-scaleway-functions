"use strict";

const {
  expect: jestExpect,
  describe,
  it,
  beforeEach,
  afterEach,
} = require("@jest/globals");
const axios = require("axios");

const ScalewayInvoke = require("../../invoke/scalewayInvoke");

function makeServerless(functionName) {
  const providers = {};
  return {
    service: {
      functions: { first: {} },
      provider: {},
    },
    config: {},
    configurationInput: { functions: { first: {} } },
    cli: { log: () => {} },
    setProvider: (name, provider) => {
      providers[name] = provider;
    },
    getProvider: (name) => providers[name],
  };
}

function makeInvoke(functionName) {
  const ScalewayProvider = require("../../provider/scalewayProvider");
  const serverless = makeServerless();
  serverless.setProvider("scaleway", new ScalewayProvider(serverless));

  const options = {
    "scw-token": "a".repeat(36),
    "scw-project": "b".repeat(36),
    function: functionName,
  };

  const invoke = new ScalewayInvoke(serverless, options);
  invoke.serverless.cli.log = () => {};
  return invoke;
}

describe("scalewayInvoke: invoke:invoke hook", () => {
  let axiosGetSpy;

  beforeEach(() => {
    axiosGetSpy = jest.spyOn(axios, "get");
  });

  afterEach(() => {
    axiosGetSpy.mockRestore();
  });

  it("invokes the matched function and awaits the request before the hook resolves", async () => {
    const invoke = makeInvoke("first");
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = () =>
      Promise.resolve([
        { name: "first", domain_name: "first.functions.fnc.example.com" },
      ]);

    let resolveGet;
    axiosGetSpy.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      })
    );

    const hookPromise = invoke.hooks["invoke:invoke"]();
    let settled = false;
    hookPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(settled).toBe(false);

    resolveGet({ data: { ok: true } });
    await hookPromise;

    jestExpect(settled).toBe(true);
    jestExpect(axiosGetSpy).toHaveBeenCalledWith(
      "https://first.functions.fnc.example.com"
    );
  });

  it("throws a clear error instead of crashing when the function isn't deployed yet", async () => {
    const invoke = makeInvoke("first");
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = () => Promise.resolve([]);

    await jestExpect(invoke.hooks["invoke:invoke"]()).rejects.toThrow(
      /not deployed yet/
    );
  });
});
