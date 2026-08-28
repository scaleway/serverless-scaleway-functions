const ScalewayProvider = require("../../provider/scalewayProvider");
const {
  FUNCTIONS_API_URL,
  CONTAINERS_API_URL,
  REGISTRY_API_URL,
  DEFAULT_REGION,
} = require("../../shared/constants");
const {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} = require("@jest/globals");

class MockServerless {
  constructor(providerConfig) {
    this.service = { provider: providerConfig || {} };
    this.cli = { log: () => {} };
  }

  setProvider(name, prov) {
    this.service.provider = prov;
  }
}

describe("ScalewayProvider.setApiURL region/URL precedence", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SCW_REGION;
    delete process.env.SCW_FUNCTION_URL;
    delete process.env.SCW_CONTAINER_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to DEFAULT_REGION when nothing else is configured", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    // setApiURL reads serverless.service.provider.scwRegion directly, so it
    // must be re-assigned after setProvider() overwrote service.provider.
    serverless.service.provider = {};

    provider.setApiURL({});

    expect(provider.getScwRegion()).toEqual(DEFAULT_REGION);
    expect(provider.apiFunctionUrl).toEqual(
      `${FUNCTIONS_API_URL}/${DEFAULT_REGION}`,
    );
    expect(provider.apiContainerUrl).toEqual(
      `${CONTAINERS_API_URL}/${DEFAULT_REGION}`,
    );
    expect(provider.registryApiUrl).toEqual(
      `${REGISTRY_API_URL}/${DEFAULT_REGION}/`,
    );
  });

  it("falls back to a region already resolved by setCredentials (e.g. from the local Scaleway CLI config file) over the hardcoded default", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};
    // Simulates setCredentials() having already set this.scwRegion from
    // ~/.config/scw/config.yaml's default_region, before setApiURL runs.
    provider.scwRegion = "nl-ams";

    provider.setApiURL({});

    expect(provider.getScwRegion()).toEqual("nl-ams");
    expect(provider.apiFunctionUrl).toEqual(`${FUNCTIONS_API_URL}/nl-ams`);
  });

  it("falls back to serverless.yml's provider.scwRegion over the default", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = { scwRegion: "nl-ams" };

    provider.setApiURL({});

    expect(provider.getScwRegion()).toEqual("nl-ams");
    expect(provider.apiFunctionUrl).toEqual(`${FUNCTIONS_API_URL}/nl-ams`);
  });

  it("prefers serverless.yml's provider.scwRegion over a region already resolved by setCredentials", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = { scwRegion: "pl-waw" };
    provider.scwRegion = "nl-ams";

    provider.setApiURL({});

    expect(provider.getScwRegion()).toEqual("pl-waw");
  });

  it("prefers the SCW_REGION environment variable over serverless.yml", () => {
    const serverless = new MockServerless({ scwRegion: "nl-ams" });
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = { scwRegion: "nl-ams" };
    process.env.SCW_REGION = "pl-waw";

    provider.setApiURL({});

    expect(provider.getScwRegion()).toEqual("pl-waw");
  });

  it("prefers the scw-region CLI option over everything else", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = { scwRegion: "nl-ams" };
    process.env.SCW_REGION = "pl-waw";

    provider.setApiURL({ "scw-region": "fr-par" });

    expect(provider.getScwRegion()).toEqual("fr-par");
  });

  it("honors SCW_FUNCTION_URL/SCW_CONTAINER_URL overrides instead of deriving them from the region", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};
    process.env.SCW_FUNCTION_URL = "https://custom-functions.example.test";
    process.env.SCW_CONTAINER_URL = "https://custom-containers.example.test";

    provider.setApiURL({ "scw-region": "fr-par" });

    expect(provider.apiFunctionUrl).toEqual(
      "https://custom-functions.example.test",
    );
    expect(provider.apiContainerUrl).toEqual(
      "https://custom-containers.example.test",
    );
    // registryApiUrl has no env override and must still be derived from the region
    expect(provider.registryApiUrl).toEqual(`${REGISTRY_API_URL}/fr-par/`);
  });
});

describe("ScalewayProvider credential accessors", () => {
  it("getFunctionCredentials/getContainerCredentials expose the region-scoped URLs with the shared token", () => {
    const serverless = new MockServerless();
    const provider = new ScalewayProvider(serverless);
    serverless.service.provider = {};
    provider.scwToken = "some-token";

    provider.setApiURL({ "scw-region": "fr-par" });

    expect(provider.getFunctionCredentials()).toEqual({
      apiUrl: `${FUNCTIONS_API_URL}/fr-par`,
      token: "some-token",
    });
    expect(provider.getContainerCredentials()).toEqual({
      apiUrl: `${CONTAINERS_API_URL}/fr-par`,
      token: "some-token",
    });
  });
});

describe("ScalewayProvider.setCredentials log suppression for `serverless info`", () => {
  it("does not log the credential source when configurationInput.service is serverlessInfo", () => {
    const serverless = new MockServerless();
    serverless.configurationInput = { service: "serverlessInfo" };
    let logged = [];
    serverless.cli.log = (msg) => logged.push(msg);
    const provider = new ScalewayProvider(serverless);

    provider.setCredentials({ "scw-token": "tok", "scw-project": "proj" });

    expect(logged).toEqual([]);
    expect(provider.scwToken).toEqual("tok");
    expect(provider.scwProject).toEqual("proj");
  });

  it("logs the credential source for a normal command", () => {
    const serverless = new MockServerless();
    let logged = [];
    serverless.cli.log = (msg) => logged.push(msg);
    const provider = new ScalewayProvider(serverless);

    provider.setCredentials({ "scw-token": "tok", "scw-project": "proj" });

    expect(logged).toContain("Using credentials from command line parameters");
  });
});
