'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const YAML = require('js-yaml');

const tmpDirCommonPath = path.join(
  os.tmpdir(),
  'tmpdirs-serverless',
  crypto.randomBytes(2).toString('hex'),
);

function getTmpDirPath() {
  return path.join(tmpDirCommonPath, crypto.randomBytes(8).toString('hex'));
}

function createTmpDir() {
  const tmpDir = getTmpDirPath();
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function replaceTextInFile(filePath, subString, newSubString) {
  const fileContent = fs.readFileSync(filePath).toString();
  fs.writeFileSync(filePath, fileContent.replace(subString, newSubString));
}

function readYamlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return YAML.load(content);
}

function writeYamlFile(filePath, content) {
  const yaml = YAML.dump(content);
  fs.writeFileSync(filePath, yaml);
  return yaml;
}

module.exports = {
  tmpDirCommonPath,
  getTmpDirPath,
  createTmpDir,

  replaceTextInFile,
  readYamlFile,
  writeYamlFile,
};
