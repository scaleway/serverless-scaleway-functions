const path = require('path');

const ROOT_PROJECT_DIRECTORY = path.resolve(__dirname, '../../../../');
const SERVERLESS_DIRECTORY = path.resolve(ROOT_PROJECT_DIRECTORY, '.serverless');

// Function Configuration
const DEFAULT_MEMORY_LIMIT = 128;
const DEFAULT_CPU_LIMIT = 1;
const DEFAULT_MIN_SCALE = 0;
const DEFAULT_MAX_SCALE = 20;

module.exports = {
  ROOT_PROJECT_DIRECTORY,
  SERVERLESS_DIRECTORY,
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_CPU_LIMIT,
  DEFAULT_MIN_SCALE,
  DEFAULT_MAX_SCALE,
};
