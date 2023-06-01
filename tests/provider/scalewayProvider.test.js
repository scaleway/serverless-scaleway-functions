const fs = require("fs");
const path = require("path");

const ScalewayProvider = require("../../provider/scalewayProvider");
const { createTmpDir } = require("../utils/fs");
const { afterAll, beforeAll, describe, it, expect } = require("@jest/globals");

class MockServerless {
  constructor() {
    this.service = {};
    this.service.provider = {};

    this.cli = {};
    this.cli.log = (logMsg) => {
      console.log(logMsg);
    };
  }

  setProvider(provName, prov) {
    this.service.provider = prov;
  }
}

describe("Scaleway credentials test", () => {
  this.expectedToken = null;
  this.expectedProject = null;

  this.serverless = new MockServerless();
  this.prov = new ScalewayProvider(this.serverless);

  beforeAll(() => {
    // Override scw config file location
    this.dummyScwConfigDir = createTmpDir();
    this.dummyScwConfigPath = path.join(this.dummyScwConfigDir, "config.yml");

    ScalewayProvider.scwConfigFile = this.dummyScwConfigPath;
  });

  afterAll(() => {
    // Delete the dummy config file and directory
    if (fs.existsSync(this.dummyScwConfigPath)) {
      fs.unlinkSync(this.dummyScwConfigPath);
    }

    if (fs.existsSync(this.dummyScwConfigDir)) {
      fs.rmdirSync(this.dummyScwConfigDir);
    }
  });

  this.checkCreds = (options) => {
    // Set the credentials
    this.prov.setCredentials(options);

    // Check they're as expected
    expect(this.prov.scwToken).toEqual(this.expectedToken);
    expect(this.prov.scwProject).toEqual(this.expectedProject);
  };

  // -------------------------------------
  // These tests must be written in order of increasing precedence, each one getting superceded by the next.
  // -------------------------------------

  it("should return nothing when no credentials found", () => {
    this.expectedToken = "";
    this.expectedProject = "";

    this.checkCreds({});
  });

  it("should read from scw config file if present", () => {
    // Write the dummy file
    const dummyScwConfigContents =
      "secret_key: scw-key\ndefault_project_id: scw-proj\n";
    fs.writeFileSync(this.dummyScwConfigPath, dummyScwConfigContents);

    this.expectedToken = "scw-key";
    this.expectedProject = "scw-proj";

    this.checkCreds({});
  });

  it("should take values from serverless.yml if present", () => {
    this.expectedToken = "conf-token";
    this.expectedProject = "conf-proj";

    this.serverless.service.provider.scwToken = this.expectedToken;
    this.serverless.service.provider.scwProject = this.expectedProject;

    this.checkCreds({});
  });

  it("should read from legacy environment variables if present", () => {
    let originalToken = process.env.SCW_TOKEN;
    let originalProject = process.env.SCW_PROJECT;

    this.expectedToken = "legacy-token";
    this.expectedProject = "legacy-proj";

    process.env.SCW_TOKEN = this.expectedToken;
    process.env.SCW_PROJECT = this.expectedProject;

    this.checkCreds({});

    process.env.SCW_TOKEN = originalToken;
    process.env.SCW_PROJECT = originalProject;
  });

  it("should read from environment variables if present", () => {
    let originalToken = process.env.SCW_SECRET_KEY;
    let originalProject = process.env.SCW_DEFAULT_PROJECT_ID;

    this.expectedToken = "env-token";
    this.expectedProject = "env-proj";

    process.env.SCW_SECRET_KEY = this.expectedToken;
    process.env.SCW_DEFAULT_PROJECT_ID = this.expectedProject;

    this.checkCreds({});

    process.env.SCW_SECRET_KEY = originalToken;
    process.env.SCW_DEFAULT_PROJECT_ID = originalProject;
  });

  it("should read credentials from options if present", () => {
    let options = {};
    options["scw-token"] = "opt-token";
    options["scw-project"] = "opt-proj";

    this.expectedToken = "opt-token";
    this.expectedProject = "opt-proj";

    this.checkCreds(options);
  });
});
