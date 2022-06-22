const { expect } = require('chai');
const { expect: jestExpect } = require('@jest/globals');

const { execSync, execCaptureOutput } = require('../../shared/child-process');

describe('Synchronous command execution test', () => {
  it('should execute a command synchronously', () => {
    execSync('ls');
  });

  it('should throw an error for an invalid command', () => {
    expect(() => {
      execSync('blah');
    }).to.throw();
  });
});

describe('Synchronous output capture of command test', () => {
  it('should capture the output of a command', () => {
    let output = execCaptureOutput('echo', ['foo bar']);
    expect(output).to.equal('foo bar\n');
  });
});
