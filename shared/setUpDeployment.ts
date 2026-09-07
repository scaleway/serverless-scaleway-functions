interface SetUpDeploymentContext {
  provider: {
    serverless: {
      service: {
        service: string;
        provider: {
          env?: Record<string, string>;
          secret?: Record<string, string>;
          runtime?: string;
          tokenExpiration?: string;
        };
      };
    };
  };
  namespaceName: string;
  namespaceVariables?: Record<string, string>;
  namespaceSecretVariables?: Record<string, string>;
  runtime?: string;
  tokenExpirationDate: string;
}

export function setUpDeployment(this: SetUpDeploymentContext): void {
  const { service } = this.provider.serverless;
  const { provider } = service;
  this.namespaceName = service.service;
  this.namespaceVariables = provider.env;
  this.namespaceSecretVariables = provider.secret;
  this.runtime = provider.runtime;

  const defaultTokenExpirationDate = new Date();
  defaultTokenExpirationDate.setFullYear(
    defaultTokenExpirationDate.getFullYear() + 1,
  );
  this.tokenExpirationDate =
    provider.tokenExpiration || defaultTokenExpirationDate.toISOString();
}
