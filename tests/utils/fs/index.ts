import os from "os";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import YAML from "js-yaml";

const tmpDirCommonPath = path.join(
  os.tmpdir(),
  "tmpdirs-serverless",
  crypto.randomBytes(2).toString("hex"),
);

export function getTmpDirPath(): string {
  return path.join(tmpDirCommonPath, crypto.randomBytes(8).toString("hex"));
}

export function createTmpDir(): string {
  const tmpDir = getTmpDirPath();
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

export function replaceTextInFile(
  filePath: string,
  subString: string,
  newSubString: string,
): void {
  const fileContent = fs.readFileSync(filePath).toString();
  fs.writeFileSync(filePath, fileContent.replace(subString, newSubString));
}

export function readYamlFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf8");
  return YAML.load(content);
}

export function writeYamlFile(filePath: string, content: unknown): string {
  const yaml = YAML.dump(content);
  fs.writeFileSync(filePath, yaml);
  return yaml;
}

export { tmpDirCommonPath };
