"use strict";

const child_process = require("child_process");

function execSync(command, options = null) {
  // Same as native but outputs std in case of error
  try {
    return child_process.execSync(command, options);
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

function execCaptureOutput(command, args) {
  let child = child_process.spawnSync(command, args, { encoding: "utf8" });

  if (child.error) {
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    throw child.error;
  }

  return child.stdout;
}

module.exports = { execSync, execCaptureOutput };
