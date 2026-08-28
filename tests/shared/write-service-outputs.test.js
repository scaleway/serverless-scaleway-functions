"use strict";

const { expect, describe, it, beforeEach } = require("@jest/globals");

jest.mock("@serverless/utils/log", () => ({
  writeText: jest.fn(),
  style: { aside: (text) => text },
}));

const { writeText } = require("@serverless/utils/log");
const writeServiceOutputs = require("../../shared/write-service-outputs");

describe("writeServiceOutputs", () => {
  beforeEach(() => {
    writeText.mockClear();
  });

  it("writes a string entry inline on the same line as the section label", () => {
    writeServiceOutputs([["service", "my-service"]]);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("service: my-service");
  });

  it("writes an array entry as an indented, newline-joined list", () => {
    writeServiceOutputs([["functions", ["funcA", "funcB"]]]);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("functions:\n  funcA\n  funcB");
  });

  it("writes an array entry with a single item without a trailing separator", () => {
    writeServiceOutputs([["endpoints", ["https://example.com"]]]);

    expect(writeText).toHaveBeenCalledWith("endpoints:\n  https://example.com");
  });

  it("writes one line per section, in order, for multiple entries", () => {
    writeServiceOutputs([
      ["service", "my-service"],
      ["functions", ["funcA", "funcB"]],
    ]);

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenNthCalledWith(1, "service: my-service");
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      "functions:\n  funcA\n  funcB"
    );
  });

  it("does not write anything for an empty list of outputs", () => {
    writeServiceOutputs([]);

    expect(writeText).not.toHaveBeenCalled();
  });
});
