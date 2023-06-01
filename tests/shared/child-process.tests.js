const { execSync, execCaptureOutput } = require("../../shared/child-process");
const { describe, it, expect } = require("@jest/globals");

describe("Synchronous command execution test", () => {
  it("should execute a command synchronously", () => {
    execSync("ls");
  });

  it("should throw an error for an invalid command", () => {
    expect(() => {
      execSync("blah");
    }).toThrow();
  });
});

describe("Synchronous output capture of command test", () => {
  it("should capture the output of a command", () => {
    let output = execCaptureOutput("echo", ["foo bar"]);
    expect(output).toEqual("foo bar\n");
  });
});
