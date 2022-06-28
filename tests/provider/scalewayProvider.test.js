const { expect } = require('chai');
const { expect: jestExpect } = require('@jest/globals');

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

const ScalewayProvider = require('../../provider/scalewayProvider');

describe('Scaleway credentials test', () => {
  this.serverless = {
    setProvider: (prov) => {
        this.provider = prov;
    },
    cli: {
        log: (logMsg) => {}
    }
  };

  this.expectedToken = null;
  this.expectedProject = null;

  this.dummyYamlFile = false;

  beforeAll(() => {
    if(!fs.existsSync(ScalewayProvider.scwConfigFile)) {
      this.dummyYamlFile = true;

      const fileContents = 'secret_key: scw-key\ndefault_project_id: scw-proj';

      // TODO - write dummy file
    }
  });

  afterAll(() => {
    if(this.dummyYamlFile) {
      // TODO - delete file
    }
  });

  this.checkCreds = (options) => {
    // Create the provider
    this.prov = new ScalewayProvider(this.serverless);

    // Set the credentials
    this.prov.setCredentials(options);

    // Check they're as expected
    expect(this.prov.scwToken).to.equal(this.expectedToken);
    expect(this.prov.scwProject).to.equal(this.expectedProject);
  };

  it('should read from scw config file', () => {
    let fileData = fs.readFileSync(ScalewayProvider.scwConfigFile, 'utf8');
    let scwConfig = yaml.safeLoad(fileData);

    this.expectedToken = scwConfig.secret_key;
    this.expectedProject = scwConfig.default_project_id;

    this.checkCreds({});
  });

  it('should read from legacy environment variables if present', () => {
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

  it('should read from environment variables if present', () => {
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

  it('should take values from serverless config if present', () => {
    this.expectedToken = "conf-token";
    this.expectedProject = "conf-proj";

    this.serverless.service = {
      provider: {
        scwToken: this.expectedToken,
        scwProject: this.expectedProject,
      },
    };

    this.checkCreds({});
  });

  it('should read credentials from options if present', () => {
    let options = {};
    options['scw-token'] = "opt-token";
    options['scw-project'] = "opt-proj";

    this.expectedToken = "opt-token";
    this.expectedProject = "opt-proj";

    this.checkCreds(options);
  });
});

