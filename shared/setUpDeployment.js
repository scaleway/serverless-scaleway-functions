module.exports = {
  setUpDeployment() {
    const { service } = this.provider.serverless;
    const { provider } = service;
    this.namespaceName = service.service;
    this.namespaceVariables = provider.env || {};
    this.runtime = provider.runtime;
  },
};
