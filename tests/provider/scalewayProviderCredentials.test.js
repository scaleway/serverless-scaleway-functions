"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} = require("@jest/globals");

const ScalewayProvider = require("../../provider/scalewayProvider");

class MockServerless {
  constructor(providerConfig) {
    this.service = { provider: providerConfig || {} };
    this.cli = { log: () => {} };
  }

  setProvider(name, prov) {
    this.service.provider = prov;
  }
}

// setCredentials() resolves scwToken/scwProject (and, for the config-file
// branch, scwRegion) from a precedence chain: CLI flags > SCW_SECRET_KEY/
// SCW_DEFAULT_PROJECT_ID > deprecated SCW_TOKEN/SCW_PROJECT > serverless.yml
// > ~/.config/scw/config.yaml > "unable to locate" fallback. This is
// auth-critical and, beyond the CLI-flags branch (covered in
// scalewayProviderApiUrl.test.js), was entirely untested.
describe("ScalewayProvider.setCredentials precedence chain", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SCW_SECRET_KEY;
    delete process.env.SCW_DEFAULT_PROJECT_ID;
    delete process.env.SCW_TOKEN;
    delete process.env.SCW_PROJECT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses SCW_SECRET_KEY/SCW_DEFAULT_PROJECT_ID from the environment when no CLI flags are given", () => {
    process.env.SCW_SECRET_KEY = "env-secret-key";
    process.env.SCW_DEFAULT_PROJECT_ID = "env-project-id";
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};

    provider.setCredentials({});

    expect(provider.scwToken).toEqual("env-secret-key");
    expect(provider.scwProject).toEqual("env-project-id");
  });

  it("falls back to the deprecated SCW_TOKEN/SCW_PROJECT env vars, with a NOTICE log", () => {
    process.env.SCW_TOKEN = "deprecated-token";
    process.env.SCW_PROJECT = "deprecated-project";
    const logged = [];
    const serverless = new MockServerless();
    serverless.cli.log = (msg) => logged.push(msg);
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};

    provider.setCredentials({});

    expect(provider.scwToken).toEqual("deprecated-token");
    expect(provider.scwProject).toEqual("deprecated-project");
    expect(logged.some((l) => l.includes("NOTICE"))).toBe(true);
  });

  it("prefers SCW_SECRET_KEY/SCW_DEFAULT_PROJECT_ID over the deprecated SCW_TOKEN/SCW_PROJECT", () => {
    process.env.SCW_SECRET_KEY = "env-secret-key";
    process.env.SCW_DEFAULT_PROJECT_ID = "env-project-id";
    process.env.SCW_TOKEN = "deprecated-token";
    process.env.SCW_PROJECT = "deprecated-project";
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};

    provider.setCredentials({});

    expect(provider.scwToken).toEqual("env-secret-key");
    expect(provider.scwProject).toEqual("env-project-id");
  });

  it("falls back to serverless.yml's provider.scwToken/scwProject when set", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {
      scwToken: "yml-token",
      scwProject: "yml-project",
    };

    provider.setCredentials({});

    expect(provider.scwToken).toEqual("yml-token");
    expect(provider.scwProject).toEqual("yml-project");
  });

  it("falls back to an empty string for both when nothing is configured anywhere", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};
    // Make sure the local Scaleway CLI config file branch isn't picked up by
    // accident in an environment that happens to have one.
    ScalewayProvider.scwConfigFile = path.join(
      os.tmpdir(),
      "definitely-does-not-exist-scw-config.yaml",
    );

    provider.setCredentials({});

    expect(provider.scwToken).toEqual("");
    expect(provider.scwProject).toEqual("");
  });

  describe("local Scaleway CLI config file fallback", () => {
    let tmpConfigFile;
    let originalConfigFile;

    beforeEach(() => {
      originalConfigFile = ScalewayProvider.scwConfigFile;
      tmpConfigFile = path.join(
        os.tmpdir(),
        `scw-config-test-${Date.now()}-${Math.random()}.yaml`,
      );
      ScalewayProvider.scwConfigFile = tmpConfigFile;
    });

    afterEach(() => {
      ScalewayProvider.scwConfigFile = originalConfigFile;
      if (fs.existsSync(tmpConfigFile)) {
        fs.unlinkSync(tmpConfigFile);
      }
    });

    it("reads scwToken/scwProject/scwRegion from the config file when nothing else is set (regression test for finding #7)", () => {
      fs.writeFileSync(
        tmpConfigFile,
        [
          "secret_key: file-secret-key",
          "default_project_id: file-project-id",
          "default_region: nl-ams",
          "",
        ].join("\n"),
      );
      const serverless = new MockServerless();
      const provider = new ScalewayProvider(serverless);
      serverless.service.provider = {};

      provider.setCredentials({});

      expect(provider.scwToken).toEqual("file-secret-key");
      expect(provider.scwProject).toEqual("file-project-id");
      // setCredentials alone should already have picked up the region; it's
      // setApiURL's job (tested separately) to not clobber it afterwards.
      expect(provider.scwRegion).toEqual("nl-ams");
    });

    it("does not set scwRegion when the config file has no default_region", () => {
      fs.writeFileSync(
        tmpConfigFile,
        [
          "secret_key: file-secret-key",
          "default_project_id: file-project-id",
          "",
        ].join("\n"),
      );
      const serverless = new MockServerless();
      const provider = new ScalewayProvider(serverless);
      serverless.service.provider = {};

      provider.setCredentials({});

      expect(provider.scwRegion).toBeUndefined();
    });
  });

  it("does not log the credential source when configurationInput.service is serverlessInfo (env var branch)", () => {
    process.env.SCW_SECRET_KEY = "env-secret-key";
    process.env.SCW_DEFAULT_PROJECT_ID = "env-project-id";
    const serverless = new MockServerless();
    serverless.configurationInput = { service: "serverlessInfo" };
    const logged = [];
    serverless.cli.log = (msg) => logged.push(msg);
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};

    provider.setCredentials({});

    expect(logged).toEqual([]);
  });
});
