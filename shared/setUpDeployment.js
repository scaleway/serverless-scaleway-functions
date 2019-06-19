module.exports = {
  setUpDeployment() {
    const service = this.provider.serverless.service;
    const provider = service.provider;
    this.namespaceName = service.service;
    this.namespaceVariables = provider.env || {};
    // If no stage provided -> use `dev` one
    this.stage = provider.stage || this.provider.defaultStage;
    this.namespaceFullName = `${this.namespaceName}-${this.stage}`;
    this.runtime = provider.runtime;
  },
};
