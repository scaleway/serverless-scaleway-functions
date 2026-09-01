// The Serverless Framework core object every plugin class receives in its
// constructor. Not typed anywhere upstream (this plugin has no dependency
// on `serverless`'s own types), so this interface only covers the fields
// this plugin's own source actually reads/writes - shared here rather than
// redeclared per file, since nearly every top-level plugin class
// (ScalewayDeploy, ScalewayInvoke, ScalewayRemove, ...) needs the same
// shape to pass to ScalewayProvider.initialize().
export interface ApplicationConfig {
  runtime?: string;
  handler: string;
  events?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface Serverless {
  cli: { log(message: string): void };
  config: { servicePath?: string };
  configurationInput?: {
    service?: string;
    singleSource?: boolean;
    custom?: { containers?: Record<string, unknown> };
  };
  service: {
    service: string;
    provider: {
      env?: Record<string, string>;
      secret?: Record<string, string>;
      runtime?: string;
      scwToken?: string;
      scwProject?: string;
      scwRegion?: string;
      tokenExpiration?: string;
    };
    functions?: Record<string, ApplicationConfig>;
    custom?: { containers?: Record<string, ApplicationConfig> };
  };
  setProvider(name: string, provider: unknown): void;
  getProvider(name: string): unknown;
  pluginManager: {
    spawn(command: string): Promise<unknown>;
    // The framework passes whatever CLI options bag it has through opaquely
    // to each plugin's constructor - each plugin class narrows `options` to
    // its own shape, which is why this can't be a fixed type without every
    // plugin class becoming un-assignable here (constructor parameters are
    // contravariant: a class requiring a narrower `options` type than `any`
    // isn't substitutable for one that must accept anything).
    addPlugin(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin: new (serverless: Serverless, options: any) => unknown,
    ): void;
  };
  processedInput: { commands: string[] };
  serviceOutputs?: Iterable<[string, string | string[]]>;
}
