const path = require('path');

const ROOT_PROJECT_DIRECTORY = path.resolve(__dirname, '../../../../');
const SERVERLESS_DIRECTORY = path.resolve(ROOT_PROJECT_DIRECTORY, '.serverless');


module.exports = {
  ROOT_PROJECT_DIRECTORY,
  SERVERLESS_DIRECTORY,
};
