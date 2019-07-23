module.exports = {
  testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.js$',
  moduleFileExtensions: [
    'js',
    'node',
  ],
  useStderr: true,
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup-tests.js',
  ],
};
