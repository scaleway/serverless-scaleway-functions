"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const functionsApi = require("../../shared/api/functions");
const containersApi = require("../../shared/api/containers");

function customError(status) {
  const err = new Error("api error");
  err.response = { status };
  return err;
}

describe("waitForFunctionStatus error tolerance", () => {
  it("tolerates a 404 (item already deleted)", async () => {
    const ctx = { getFunction: () => Promise.reject(customError(404)) };

    await jestExpect(
      functionsApi.waitForFunctionStatus.call(ctx, "func-id", "ready")
    ).resolves.toBeUndefined();
  });

  it("throws on a non-404 4xx instead of silently resolving to undefined", async () => {
    const ctx = { getFunction: () => Promise.reject(customError(403)) };

    await jestExpect(
      functionsApi.waitForFunctionStatus.call(ctx, "func-id", "ready")
    ).rejects.toThrow();
  });

  it("throws on a 5xx", async () => {
    const ctx = { getFunction: () => Promise.reject(customError(500)) };

    await jestExpect(
      functionsApi.waitForFunctionStatus.call(ctx, "func-id", "ready")
    ).rejects.toThrow();
  });

  it("throws the raw error when there is no response at all", async () => {
    const rawErr = new Error("network down");
    const ctx = { getFunction: () => Promise.reject(rawErr) };

    await jestExpect(
      functionsApi.waitForFunctionStatus.call(ctx, "func-id", "ready")
    ).rejects.toThrow("network down");
  });
});

describe("waitForContainer error tolerance", () => {
  it("tolerates a 404 (item already deleted)", async () => {
    const ctx = { getContainer: () => Promise.reject(customError(404)) };

    await jestExpect(
      containersApi.waitForContainer.call(ctx, "container-id")
    ).resolves.toBeUndefined();
  });

  it("throws on a non-404 4xx instead of silently resolving to undefined", async () => {
    const ctx = { getContainer: () => Promise.reject(customError(403)) };

    await jestExpect(
      containersApi.waitForContainer.call(ctx, "container-id")
    ).rejects.toThrow();
  });

  it("throws on a 5xx", async () => {
    const ctx = { getContainer: () => Promise.reject(customError(500)) };

    await jestExpect(
      containersApi.waitForContainer.call(ctx, "container-id")
    ).rejects.toThrow();
  });

  it("throws the raw error when there is no response at all", async () => {
    const rawErr = new Error("network down");
    const ctx = { getContainer: () => Promise.reject(rawErr) };

    await jestExpect(
      containersApi.waitForContainer.call(ctx, "container-id")
    ).rejects.toThrow("network down");
  });
});
