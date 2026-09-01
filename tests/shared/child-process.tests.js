const { execSync, execCaptureOutput } = require("../../shared/child-process");

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

  it("should throw the underlying error instead of silently returning undefined when the command doesn't exist", () => {
    expect(() => {
      execCaptureOutput("this-command-definitely-does-not-exist", []);
    }).toThrow();
  });
});
