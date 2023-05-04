const { AccountApi } = require('../shared/api');
const { ACCOUNT_API_URL } = require('../shared/constants');
const { removeProjectById } = require('./utils/clean-up');

module.exports = async () => {
  const accountApi = new AccountApi(ACCOUNT_API_URL, process.env.SCW_SECRET_KEY);
  const projects = await accountApi.listProjects(process.env.SCW_ORGANIZATION_ID);
  for (const project of projects) {
    if (project.name.includes('test-slsframework-')) {
      process.env.SCW_DEFAULT_PROJECT_ID = project.id;
      await removeProjectById(project.id)
        .catch();
    }
  }
}
