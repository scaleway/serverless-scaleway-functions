"use strict";

const jestExpect = expect;

const ScalewayInvoke = require("../../invoke/scalewayInvoke");

function makeResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: () =>
      Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

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
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("invokes the matched function and awaits the request before the hook resolves", async () => {
    const invoke = makeInvoke("first");
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = () =>
      Promise.resolve([
        { name: "first", domain_name: "first.functions.fnc.example.com" },
      ]);

    let resolveGet;
    fetchSpy.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }),
    );

    const hookPromise = invoke.hooks["invoke:invoke"]();
    let settled = false;
    hookPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(settled).toBe(false);

    resolveGet(makeResponse({ ok: true }));
    await hookPromise;

    jestExpect(settled).toBe(true);
    jestExpect(fetchSpy.mock.calls[0][0]).toEqual(
      "https://first.functions.fnc.example.com",
    );
  });

  it("throws a clear error instead of crashing when the function isn't deployed yet", async () => {
    const invoke = makeInvoke("first");
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = () => Promise.resolve([]);

    await jestExpect(invoke.hooks["invoke:invoke"]()).rejects.toThrow(
      /not deployed yet/,
    );
  });

  it("does not reject when the invoked endpoint errors, but writes the error to stderr", async () => {
    const invoke = makeInvoke("first");
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = () =>
      Promise.resolve([
        { name: "first", domain_name: "first.functions.fnc.example.com" },
      ]);

    const rejected = Promise.reject(new Error("network error"));
    // Prevent Node's own unhandled-rejection detection from firing before
    // doInvoke gets a chance to attach its .catch() a few microtasks later.
    rejected.catch(() => {});
    fetchSpy.mockReturnValue(rejected);
    const stderrSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await jestExpect(invoke.hooks["invoke:invoke"]()).resolves.toBeUndefined();

    jestExpect(stderrSpy).toHaveBeenCalledWith(
      jestExpect.stringContaining("network error"),
    );
    stderrSpy.mockRestore();
  });

  it("writes the error to stderr instead of stdout when the invoked endpoint returns a non-2xx status", async () => {
    const invoke = makeInvoke("first");
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = () =>
      Promise.resolve([
        { name: "first", domain_name: "first.functions.fnc.example.com" },
      ]);

    fetchSpy.mockReturnValue(
      Promise.resolve(makeResponse("boom", { ok: false, status: 500 })),
    );
    const stdoutSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderrSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await jestExpect(invoke.hooks["invoke:invoke"]()).resolves.toBeUndefined();

    jestExpect(stdoutSpy).not.toHaveBeenCalled();
    jestExpect(stderrSpy).toHaveBeenCalledWith(
      jestExpect.stringContaining("status code 500"),
    );
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("dispatches to listContainers (not listFunctions) when the target is a container", async () => {
    const invoke = makeInvoke("first-container");
    invoke.serverless.service.custom = {
      containers: { "first-container": {} },
    };
    invoke.serverless.service.functions = {};
    invoke.getNamespaceFromList = () => Promise.resolve({ id: "ns-1" });
    invoke.listFunctions = jest.fn(() => Promise.resolve([]));
    invoke.listContainers = jest.fn(() =>
      Promise.resolve([
        {
          name: "first-container",
          domain_name: "first-container.containers.fnc.example.com",
        },
      ]),
    );

    fetchSpy.mockReturnValue(Promise.resolve(makeResponse({})));

    await invoke.hooks["invoke:invoke"]();

    jestExpect(invoke.listContainers).toHaveBeenCalledWith("ns-1");
    jestExpect(invoke.listFunctions).not.toHaveBeenCalled();
  });
});

describe("scalewayInvoke: before:invoke:invoke hook validation errors", () => {
  it("throws when no function/container name was specified at all", async () => {
    const invoke = makeInvoke(undefined);

    await jestExpect(invoke.hooks["invoke:invoke"]()).rejects.toThrow(
      /not specified/,
    );
  });

  it("throws a correctly-spelled error (regression test for the 'servleress.yml' typo fix) when the name isn't defined anywhere in serverless.yml", async () => {
    const invoke = makeInvoke("does-not-exist");

    await jestExpect(invoke.hooks["invoke:invoke"]()).rejects.toThrow(
      "Function or container does-not-exist not defined in serverless.yml",
    );
  });
});
