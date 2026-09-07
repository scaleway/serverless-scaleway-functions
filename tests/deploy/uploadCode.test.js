"use strict";

const jestExpect = expect;
const fs = require("fs");

const uploadCode = require("../../deploy/lib/uploadCode");

describe("getPresignedUrlForFunctions", () => {
  it("attaches the presigned upload URL and headers to each function", async () => {
    const statSyncSpy = jest
      .spyOn(fs, "statSync")
      .mockReturnValue({ size: 1234 });

    const func = { id: "func-1", name: "first" };
    const ctx = {
      serverless: { config: { servicePath: "/tmp/service" } },
      namespaceName: "my-service",
      functions: [func],
      getPresignedUrl: (functionId, archiveSize) => {
        jestExpect(functionId).toEqual("func-1");
        jestExpect(archiveSize).toEqual(1234);
        return Promise.resolve({ url: "https://upload.example.com/put" });
      },
    };

    const result = await uploadCode.getPresignedUrlForFunctions.call(ctx);

    jestExpect(result).toEqual([
      {
        id: "func-1",
        name: "first",
        uploadUrl: "https://upload.example.com/put",
        uploadHeader: {
          content_length: 1234,
          "Content-Type": "application/octet-stream",
        },
      },
    ]);
    statSyncSpy.mockRestore();
  });

  it("wraps any failure into a single generic error instead of leaving it unhandled", async () => {
    const statSyncSpy = jest
      .spyOn(fs, "statSync")
      .mockReturnValue({ size: 1234 });

    const ctx = {
      serverless: { config: { servicePath: "/tmp/service" } },
      namespaceName: "my-service",
      functions: [{ id: "func-1", name: "first" }],
      getPresignedUrl: () => Promise.reject(new Error("network blip")),
    };

    await jestExpect(
      uploadCode.getPresignedUrlForFunctions.call(ctx),
    ).rejects.toThrow(
      "An error occured while getting a presigned URL to upload functions's archived code.",
    );
    statSyncSpy.mockRestore();
  });
});

describe("uploadFunctionsCode", () => {
  it("rejects (does not silently resolve) when reading the archive fails", async () => {
    const readFileSpy = jest
      .spyOn(fs.promises, "readFile")
      .mockRejectedValue(new Error("ENOENT: no such file"));

    const ctx = {
      serverless: {
        config: { servicePath: "/tmp/service" },
        cli: { log: () => {} },
      },
      namespaceName: "my-service",
    };
    const func = {
      id: "func-1",
      uploadUrl: "https://upload.example.com/put",
      uploadHeader: {},
    };

    await jestExpect(
      uploadCode.uploadFunctionsCode.call(ctx, [func]),
    ).rejects.toThrow("ENOENT: no such file");

    readFileSpy.mockRestore();
  });
});

describe("uploadCode (full orchestration)", () => {
  it("passes the presigned functions through to uploadFunctionsCode", async () => {
    const presigned = [{ id: "func-1", uploadUrl: "https://x.example.com" }];
    const ctx = {
      ...uploadCode,
      getPresignedUrlForFunctions: () => Promise.resolve(presigned),
      uploadFunctionsCode: (functions) => {
        jestExpect(functions).toBe(presigned);
        return Promise.resolve();
      },
    };

    await uploadCode.uploadCode.call(ctx);
  });

  it("propagates a presigned-URL failure instead of attempting the upload", async () => {
    const ctx = {
      ...uploadCode,
      getPresignedUrlForFunctions: () =>
        Promise.reject(new Error("presign failed")),
    };

    await jestExpect(uploadCode.uploadCode.call(ctx)).rejects.toThrow(
      "presign failed",
    );
  });
});
