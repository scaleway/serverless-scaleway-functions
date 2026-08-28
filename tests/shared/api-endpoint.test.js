"use strict";

const { expect, describe, it } = require("@jest/globals");

const { getApi } = require("../../shared/api/endpoint");
const { FunctionApi, ContainerApi } = require("../../shared/api");

function makeObject({ containers, functions }) {
  return {
    provider: {
      serverless: {
        service: {
          custom: containers ? { containers } : undefined,
          functions,
        },
      },
      getContainerCredentials: () => ({
        apiUrl: "https://containers.example.test",
        token: "tok",
      }),
      getFunctionCredentials: () => ({
        apiUrl: "https://functions.example.test",
        token: "tok",
      }),
    },
  };
}

describe("getApi", () => {
  it("returns a ContainerApi when only custom.containers is defined", () => {
    const api = getApi(makeObject({ containers: { web: {} } }));

    expect(api).toBeInstanceOf(ContainerApi);
  });

  it("returns a FunctionApi when only functions is defined", () => {
    const api = getApi(makeObject({ functions: { handler: {} } }));

    expect(api).toBeInstanceOf(FunctionApi);
  });

  it("returns undefined when neither functions nor custom.containers is defined", () => {
    const api = getApi(makeObject({}));

    expect(api).toBeUndefined();
  });

  it("prefers FunctionApi when both functions and custom.containers are defined", () => {
    // Documents current dispatch precedence: functions is checked second and
    // unconditionally overwrites the container API selection. See
    // docs/fixing-plan.md #15 - validate.js doesn't yet reject this
    // configuration, so getApi()'s tie-break is what actually decides which
    // API implementation the rest of the plugin gets.
    const api = getApi(
      makeObject({ containers: { web: {} }, functions: { handler: {} } }),
    );

    expect(api).toBeInstanceOf(FunctionApi);
  });

  it("treats an empty custom.containers object as not defining containers", () => {
    const api = getApi(makeObject({ containers: {} }));

    expect(api).toBeUndefined();
  });
});
