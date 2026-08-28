import { Serverless } from "../../shared/serverlessTypes";

// Shared across the provider test files, which previously each hand-rolled
// their own near-identical (and in one case, subtly different) copy of this
// class. `implements Serverless` means this mock is statically checked
// against the real interface - if Serverless ever gains a new required
// field, this file (not a live test run) is where that shows up, instead of
// the mock silently drifting out of sync with what it's supposed to stand
// in for.
export class MockServerless implements Serverless {
  cli: { log(message: string): void };
  config: { servicePath?: string };
  configurationInput?: Serverless["configurationInput"];
  service: Serverless["service"];

  constructor(providerConfig: Partial<Serverless["service"]["provider"]> = {}) {
    this.service = { service: "mock-service", provider: providerConfig };
    this.cli = { log: () => {} };
    this.config = {};
  }

  setProvider(_name: string, provider: unknown): void {
    this.service.provider = provider as Serverless["service"]["provider"];
  }

  getProvider(_name: string): unknown {
    return undefined;
  }

  pluginManager: Serverless["pluginManager"] = {
    spawn: async () => undefined,
    addPlugin: () => {},
  };

  processedInput: Serverless["processedInput"] = { commands: [] };
}
