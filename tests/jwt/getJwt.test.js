"use strict";

const getJwt = require("../../jwt/lib/getJwt");

describe("setNamespace", () => {
  it("throws a clear error when the namespace hasn't been deployed yet", () => {
    const ctx = { namespaceName: "my-service" };

    expect(() => getJwt.setNamespace.call(ctx, undefined)).toThrow(
      "Namespace <my-service> doesn't exist, you should deploy it first.",
    );
  });

  it("stores the namespace on the context when it exists", () => {
    const ctx = { namespaceName: "my-service" };
    const namespace = { id: "ns-1", name: "my-service" };

    getJwt.setNamespace.call(ctx, namespace);

    expect(ctx.namespace).toBe(namespace);
  });
});

describe("getJwtFunctions", () => {
  function makeCtx() {
    const logged = [];
    return {
      tokenExpirationDate: "2099-01-01",
      serverless: { cli: { log: (msg) => logged.push(msg) } },
      logged,
      issueJwtFunction: jest.fn(() =>
        Promise.resolve({ token: "issued-token" }),
      ),
    };
  }

  it("issues a JWT only for private functions, leaving public ones untouched", async () => {
    const ctx = makeCtx();
    const privateFunc = {
      id: "func-private",
      name: "priv",
      privacy: "private",
    };
    const publicFunc = { id: "func-public", name: "pub", privacy: "public" };

    await getJwt.getJwtFunctions.call(ctx, [privateFunc, publicFunc]);

    expect(ctx.issueJwtFunction).toHaveBeenCalledTimes(1);
    expect(ctx.issueJwtFunction).toHaveBeenCalledWith(
      "func-private",
      "2099-01-01",
    );
    expect(privateFunc.token).toEqual("issued-token");
    expect(publicFunc.token).toBeUndefined();
  });

  it("does nothing and issues no tokens when there are no private functions", async () => {
    const ctx = makeCtx();
    const publicFunc = { id: "func-public", name: "pub", privacy: "public" };

    const result = await getJwt.getJwtFunctions.call(ctx, [publicFunc]);

    expect(ctx.issueJwtFunction).not.toHaveBeenCalled();
    expect(result).toEqual([undefined]);
  });
});

describe("getJwtContainers", () => {
  it("skips public containers without issuing a token", async () => {
    const ctx = {
      tokenExpirationDate: "2099-01-01",
      serverless: { cli: { log: () => {} } },
      issueJwtFunction: jest.fn(),
      issueJwtContainer: jest.fn(),
    };
    const publicContainer = {
      id: "cont-public",
      name: "pub",
      privacy: "public",
    };

    const result = await getJwt.getJwtContainers.call(ctx, [publicContainer]);

    expect(ctx.issueJwtFunction).not.toHaveBeenCalled();
    expect(ctx.issueJwtContainer).not.toHaveBeenCalled();
    expect(result).toEqual([undefined]);
    expect(publicContainer.token).toBeUndefined();
  });

  it("issues a JWT via issueJwtContainer (not issueJwtFunction) for private containers", async () => {
    const ctx = {
      tokenExpirationDate: "2099-01-01",
      serverless: { cli: { log: () => {} } },
      issueJwtFunction: jest.fn(),
      issueJwtContainer: jest.fn(() =>
        Promise.resolve({ token: "issued-token" }),
      ),
    };
    const privateContainer = {
      id: "cont-private",
      name: "priv",
      privacy: "private",
    };

    await getJwt.getJwtContainers.call(ctx, [privateContainer]);

    expect(ctx.issueJwtFunction).not.toHaveBeenCalled();
    expect(ctx.issueJwtContainer).toHaveBeenCalledTimes(1);
    expect(ctx.issueJwtContainer).toHaveBeenCalledWith(
      "cont-private",
      "2099-01-01",
    );
    expect(privateContainer.token).toEqual("issued-token");
  });
});

describe("getJwt (full orchestration chain)", () => {
  function baseCtx() {
    return {
      ...getJwt,
      namespaceName: "my-service",
      tokenExpirationDate: "2099-01-01",
      provider: { getScwProject: () => "project-1" },
      serverless: { cli: { log: () => {} } },
      getNamespaceFromList: () =>
        Promise.resolve({ id: "ns-1", name: "my-service" }),
      issueJwtNamespace: () => Promise.resolve({ token: "ns-token" }),
    };
  }

  it("dispatches to listFunctions/getJwtFunctions for a function service", async () => {
    const ctx = baseCtx();
    ctx.listFunctions = (namespaceId) => {
      expect(namespaceId).toEqual("ns-1");
      return Promise.resolve([
        { id: "func-1", name: "first", privacy: "private" },
      ]);
    };
    ctx.issueJwtFunction = () => Promise.resolve({ token: "func-token" });

    await getJwt.getJwt.call(ctx);

    expect(ctx.namespace.token).toEqual("ns-token");
  });

  it("dispatches to listContainers/getJwtContainers for a container service", async () => {
    const ctx = baseCtx();
    ctx.listContainers = (namespaceId) => {
      expect(namespaceId).toEqual("ns-1");
      return Promise.resolve([
        { id: "cont-1", name: "web", privacy: "private" },
      ]);
    };
    ctx.issueJwtContainer = () => Promise.resolve({ token: "cont-token" });

    await getJwt.getJwt.call(ctx);

    expect(ctx.namespace.token).toEqual("ns-token");
  });

  it("propagates the setNamespace error when the namespace hasn't been deployed", async () => {
    const ctx = baseCtx();
    ctx.getNamespaceFromList = () => Promise.resolve(undefined);
    ctx.listFunctions = () => Promise.resolve([]);

    await expect(getJwt.getJwt.call(ctx)).rejects.toThrow(
      "doesn't exist, you should deploy it first",
    );
  });
});
