"use strict";

const jestExpect = expect;

const domainApi = require("../../shared/api/domain");

describe("createDomain request field mapping", () => {
  it("maps function_id to functionId", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createDomain: (request) => {
          capturedRequest = request;
          return Promise.resolve({
            id: "domain-1",
            hostname: "my.example.com",
          });
        },
      },
    };

    await domainApi.createDomain.call(ctx, {
      hostname: "my.example.com",
      function_id: "func-1",
    });

    jestExpect(capturedRequest.functionId).toBe("func-1");
    jestExpect(capturedRequest.containerId).toBeUndefined();
  });

  it("maps container_id to containerId", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createDomain: (request) => {
          capturedRequest = request;
          return Promise.resolve({
            id: "domain-1",
            hostname: "my.example.com",
          });
        },
      },
    };

    await domainApi.createDomain.call(ctx, {
      hostname: "my.example.com",
      container_id: "container-1",
    });

    jestExpect(capturedRequest.containerId).toBe("container-1");
    jestExpect(capturedRequest.functionId).toBeUndefined();
  });
});

describe("deleteDomain", () => {
  it("sends domainId and returns the deleted domain", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        deleteDomain: (request) => {
          capturedRequest = request;
          return Promise.resolve({
            id: "domain-1",
            hostname: "my.example.com",
          });
        },
      },
    };

    const result = await domainApi.deleteDomain.call(ctx, "domain-1");

    jestExpect(capturedRequest).toEqual({ domainId: "domain-1" });
    jestExpect(result.hostname).toBe("my.example.com");
  });
});
