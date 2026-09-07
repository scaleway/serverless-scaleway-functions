import { AxiosInstance } from "axios";

// Shared `this` context for the shared/api/*.ts mixin modules: their methods
// get Object.assign()'d onto AccountApi/FunctionApi/ContainerApi instances
// (shared/api/index.js) and, transitively, onto the ScalewayDeploy plugin
// instance (deploy/scalewayDeploy.js) - both still plain .js, so this file
// documents the contract those consumers rely on rather than enforcing it.
export interface ApiManagerContext {
  apiManager: AxiosInstance;
}

export interface ServerlessLoggerContext {
  serverless: {
    cli: {
      log(message: string): void;
    };
  };
}
