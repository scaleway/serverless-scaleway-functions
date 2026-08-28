"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const { manageError, CustomError } = require("../../shared/api/utils");

describe("manageError", () => {
  it("throws using err.response.data.message when present", () => {
    const err = { response: { data: { message: "invalid handler" } } };

    jestExpect(() => manageError(err)).toThrow(CustomError);
    jestExpect(() => manageError(err)).toThrow("invalid handler");
  });

  it("appends details for InvalidArgumentsError", () => {
    const err = {
      response: {
        data: {
          message: "invalid arguments",
          type: "invalid_arguments",
          details: [
            { argument_name: "memoryLimit", help_message: "must be > 0" },
          ],
        },
      },
    };

    jestExpect(() => manageError(err)).toThrow(
      "invalid arguments\nmemoryLimit: must be > 0",
    );
  });

  it("throws using err.response.data.error_message when message is absent", () => {
    const err = { response: { data: { error_message: "not found" } } };

    jestExpect(() => manageError(err)).toThrow("not found");
  });

  it("throws instead of returning undefined when the error body has neither field", () => {
    const err = { response: { data: { code: "unknown_error" } } };

    jestExpect(() => manageError(err)).toThrow(CustomError);
    jestExpect(() => manageError(err)).toThrow(/unknown_error/);
  });

  it("throws a plain Error when there is no response data at all", () => {
    const err = new Error("network error");

    jestExpect(() => manageError(err)).toThrow();
  });

  it("strips headers/request off the thrown CustomError's response, keeping only status/data", () => {
    const err = {
      response: {
        status: 403,
        data: { message: "insufficient permissions" },
        headers: { "x-request-id": "abc" },
        request: {
          _header: "GET / HTTP/1.1\r\nX-Auth-Token: super-secret-token\r\n\r\n",
        },
        config: { headers: { "X-Auth-Token": "super-secret-token" } },
      },
    };

    let thrown;
    try {
      manageError(err);
    } catch (e) {
      thrown = e;
    }

    jestExpect(thrown).toBeInstanceOf(CustomError);
    jestExpect(thrown.response).toEqual({
      status: 403,
      data: { message: "insufficient permissions" },
    });
    jestExpect(thrown.response.headers).toBeUndefined();
    jestExpect(thrown.response.request).toBeUndefined();
    jestExpect(thrown.response.config).toBeUndefined();
    jestExpect(JSON.stringify(thrown)).not.toMatch(/super-secret-token/);
  });
});
