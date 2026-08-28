import fs from "fs";
import path from "path";
import axios from "axios";

interface FunctionRecord {
  id: string;
  uploadUrl?: string;
  uploadHeader?: Record<string, string | number>;
  [key: string]: unknown;
}

interface UploadCodeContext {
  serverless: {
    cli: { log(message: string): void };
    config: { servicePath?: string };
  };
  namespaceName: string;
  functions: FunctionRecord[];
  getPresignedUrl(
    functionId: string,
    archiveSize: number,
  ): Promise<{ url: string; headers: Record<string, string[]> }>;
  getPresignedUrlForFunctions(): Promise<FunctionRecord[]>;
  uploadFunctionsCode(functions: FunctionRecord[]): Promise<unknown[]>;
}

export async function uploadCode(this: UploadCodeContext): Promise<unknown[]> {
  const functions = await this.getPresignedUrlForFunctions();
  return this.uploadFunctionsCode(functions);
}

export function getPresignedUrlForFunctions(
  this: UploadCodeContext,
): Promise<FunctionRecord[]> {
  const promises = this.functions.map((func) => {
    const archivePath = path.resolve(
      this.serverless.config.servicePath!,
      ".serverless",
      `${this.namespaceName}.zip`,
    );
    const stats = fs.statSync(archivePath);
    const archiveSize = stats.size;

    // get presigned url
    return this.getPresignedUrl(func.id, archiveSize).then((response) =>
      Object.assign(func, {
        uploadUrl: response.url,
        uploadHeader: {
          content_length: archiveSize,
          "Content-Type": "application/octet-stream",
        },
      }),
    );
  });

  return Promise.all(promises).catch(() => {
    throw new Error(
      "An error occured while getting a presigned URL to upload functions's archived code.",
    );
  });
}

export function uploadFunctionsCode(
  this: UploadCodeContext,
  functions: FunctionRecord[],
): Promise<unknown[]> {
  this.serverless.cli.log("Uploading source code...");
  // Upload functions to s3
  const promises = functions.map((func) => {
    const archivePath = path.resolve(
      this.serverless.config.servicePath!,
      ".serverless",
      `${this.namespaceName}.zip`,
    );
    return fs.promises.readFile(archivePath).then((data) =>
      axios({
        data,
        method: "put" as const,
        url: func.uploadUrl,
        headers: func.uploadHeader,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }),
    );
  });

  return Promise.all(promises);
}
