module.exports = {
  setUpDeployment() {
    const service = this.provider.serverless.service;
    const provider = service.provider;
    this.namespaceName = service.service;
    this.namespaceVariables = provider.env || {};
    this.runtime = provider.runtime;
  },
};
