module.exports = {
  setUpDeployment() {
    const { service } = this.provider.serverless;
    const { provider } = service;
    this.namespaceName = service.service;
    this.namespaceVariables = provider.env || {};
    this.namespaceSecretVariables = provider.secret || {};
    this.runtime = provider.runtime;

    const defaultTokenExpirationDate = new Date();
    defaultTokenExpirationDate.setFullYear(
      defaultTokenExpirationDate.getFullYear() + 1
    );
    this.tokenExpirationDate =
      provider.tokenExpiration || defaultTokenExpirationDate.toISOString();
  },
};
