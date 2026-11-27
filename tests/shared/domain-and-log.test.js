"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const domainApi = require("../../shared/api/domain");

describe("createDomainAndLog", () => {
  it("waits for domain creation to actually complete before resolving", async () => {
    let resolveCreate;
    const created = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    let settled = false;

    const ctx = {
      createDomain: () => created,
      serverless: { cli: { log: () => {} } },
    };

    const resultPromise = domainApi.createDomainAndLog
      .call(ctx, { hostname: "my.example.com" })
      .then(() => {
        settled = true;
      });

    await Promise.resolve();
    await Promise.resolve();
    jestExpect(settled).toBe(false);

    resolveCreate({ hostname: "my.example.com" });
    await resultPromise;

    jestExpect(settled).toBe(true);
  });

  it("resolves (does not reject) even when domain creation fails, after logging it", async () => {
    const logs = [];
    const ctx = {
      createDomain: () => Promise.reject(new Error("could not validate")),
      serverless: { cli: { log: (msg) => logs.push(msg) } },
    };

    await jestExpect(
      domainApi.createDomainAndLog.call(ctx, { hostname: "my.example.com" })
    ).resolves.toBeUndefined();

    jestExpect(logs.some((l) => l.includes("Error on domain"))).toBe(true);
  });
});
