"use strict";

const setUpDeployment = require("../../shared/setUpDeployment");

describe("setUpDeployment", () => {
  function ctxWith(providerOverrides) {
    return {
      provider: {
        serverless: {
          service: {
            service: "my-service",
            provider: {
              env: { FOO: "bar" },
              secret: { TOKEN: "shh" },
              runtime: "node20",
              ...providerOverrides,
            },
          },
        },
      },
    };
  }

  it("copies namespace name/env/secret/runtime straight from serverless.yml", () => {
    const ctx = ctxWith({});

    setUpDeployment.setUpDeployment.call(ctx);

    expect(ctx.namespaceName).toEqual("my-service");
    expect(ctx.namespaceVariables).toEqual({ FOO: "bar" });
    expect(ctx.namespaceSecretVariables).toEqual({ TOKEN: "shh" });
    expect(ctx.runtime).toEqual("node20");
  });

  it("uses the explicit tokenExpiration from serverless.yml when set", () => {
    const ctx = ctxWith({ tokenExpiration: "2030-01-01T00:00:00.000Z" });

    setUpDeployment.setUpDeployment.call(ctx);

    expect(ctx.tokenExpirationDate).toEqual("2030-01-01T00:00:00.000Z");
  });

  it("defaults tokenExpirationDate to exactly one year from now when not configured", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
    const ctx = ctxWith({});

    setUpDeployment.setUpDeployment.call(ctx);

    expect(ctx.tokenExpirationDate).toEqual("2027-08-26T12:00:00.000Z");
    jest.useRealTimers();
  });
});
