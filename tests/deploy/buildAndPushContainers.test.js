const rewire = require("rewire");
const { Readable } = require("stream");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} = require("@jest/globals");

const buildAndPushContainers = rewire(
  "../../deploy/lib/buildAndPushContainers.js"
);
const extractStreamContents = buildAndPushContainers.__get__(
  "extractStreamContents"
);
const findErrorInBuildOutput = buildAndPushContainers.__get__(
  "findErrorInBuildOutput"
);
const getFilesInBuildContextDirectory = buildAndPushContainers.__get__(
  "getFilesInBuildContextDirectory"
);
const filterFilesWithDockerignore = buildAndPushContainers.__get__(
  "filterFilesWithDockerignore"
);

describe("extractStreamContents", () => {
  it("should extract the contents of a stream", async () => {
    const stream = new Readable();
    stream.push("line1");
    stream.push("line2");
    stream.push("line3");
    stream.push(null); // finishes the stream

    const actual = await extractStreamContents(stream, false);
    const expected = ["line1", "line2", "line3"];
    expect(actual).toEqual(expected);
  });
});

describe("findErrorInBuildOutput", () => {
  it("should return undefined if there is no error in the build output", () => {
    const buildOutput = [
      '{"stream":"Step 1/6 : FROM python:3.10.3-alpine3.15"}',
      '{"stream":"\n"}',
      '{"stream":"Step 2/6 : WORKDIR /usr/src/app"}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e a6d61425220f\n"}',
      '{"stream":"Step 3/6 : COPY requirements.txt ."}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e 2c7ea80fe765\n"}',
      '{"stream":"Step 4/6 : RUN pip install -qr requirements.txt"}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e 1956f056d5ef\n"}',
      '{"stream":"Step 5/6 : COPY server.py ."}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e 7cd18093d4d5\n"}',
      '{"stream":"Step 6/6 : CMD ["python3", "./server.py"]"}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e 18a3aff98512\n"}',
      '{"aux":{"ID":"sha256:18a3aff985122ac60ac1a333e036bf80633070d1c84cb41d6a8140cb23c2b1a0"}}',
      '{"stream":"Successfully built 18a3aff98512\n"}',
      '{"stream":"Successfully tagged rg.fr-par.scw.cloud/funcscwcontainerc5xpewjq/first:latest\n"}',
    ];

    const actual = findErrorInBuildOutput(buildOutput);
    const expected = undefined;
    expect(actual).toEqual(expected);
  });

  it("should return the error message if there is an error in the build output (step failed)", () => {
    const buildOutput = [
      '{"stream":"Step 1/7 : FROM python:3.10.3-alpine3.15"}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e 82926ff1b668\n"}',
      '{"stream":"Step 2/7 : WORKDIR /usr/src/app"}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e a6d61425220f\n"}',
      '{"stream":"Step 3/7 : RUN unknown_command"}',
      '{"stream":"\n"}',
      '{"stream":" ---\u003e Running in 45fe4e8ec27b\n"}',
      '{"stream":"\u001b[91m/bin/sh: unknown_command: not found\n\u001b[0m"}',
      '{"errorDetail":{"code":127,"message":"The command \'/bin/sh -c unknown_command\' returned a non-zero code: 127"},"error":"The command \'/bin/sh -c unknown_command\' returned a non-zero code: 127"}',
    ];

    const actual = findErrorInBuildOutput(buildOutput);
    const expected =
      "The command '/bin/sh -c unknown_command' returned a non-zero code: 127";
    expect(actual).toEqual(expected);
  });

  it("should return the error message if there is an error in the build output (pull failed)", () => {
    const buildOutput = [
      '{"stream":"Step 1/6 : FROM rg.fr-par.scw.cloud/some-private-registry/python:3.10.3-alpine3.15"}',
      '{"stream":"\n"}',
      '{"errorDetail":{"message":"Head \\"https://rg.fr-par.scw.cloud/v2/some-private-registry/python/manifests/3.10.3-alpine3.15\\": error parsing HTTP 403 response body: no error details found in HTTP response body: \\"{\\"details\\":[{\\"action\\":\\"read\\",\\"resource\\":\\"api_namespace\\"},{\\"action\\":\\"read\\",\\"resource\\":\\"registry_image\\"}],\\"message\\":\\"insufficient permissions\\",\\"type\\":\\"permissions_denied\\"}\\""},"error":"Head \\"https://rg.fr-par.scw.cloud/v2/some-private-registry/python/manifests/3.10.3-alpine3.15\\": error parsing HTTP 403 response body: no error details found in HTTP response body: \\"{\\"details\\":[{\\"action\\":\\"read\\",\\"resource\\":\\"api_namespace\\"},{\\"action\\":\\"read\\",\\"resource\\":\\"registry_image\\"}],\\"message\\":\\"insufficient permissions\\",\\"type\\":\\"permissions_denied\\"}"}',
    ];

    const actual = findErrorInBuildOutput(buildOutput);
    const expected =
      'Head "https://rg.fr-par.scw.cloud/v2/some-private-registry/python/manifests/3.10.3-alpine3.15": error parsing HTTP 403 response body: no error details found in HTTP response body: "{"details":[{"action":"read","resource":"api_namespace"},{"action":"read","resource":"registry_image"}],"message":"insufficient permissions","type":"permissions_denied"}"';
    expect(actual).toEqual(expected);
  });
});

describe("filterFilesWithDockerignore", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerignore-test-"));
    fs.mkdirSync(path.join(dir, "node_modules", "some-dep"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, "node_modules", "some-dep", "index.js"),
      ""
    );
    fs.writeFileSync(path.join(dir, "server.py"), "");
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=shh");
    fs.writeFileSync(path.join(dir, "keep.env.example"), "");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns every file unfiltered when there is no .dockerignore", () => {
    const files = getFilesInBuildContextDirectory(dir);
    const actual = filterFilesWithDockerignore(dir, files).sort();

    expect(actual).toEqual(
      [
        "server.py",
        ".env",
        "keep.env.example",
        path.join("node_modules", "some-dep", "index.js"),
      ].sort()
    );
  });

  it("excludes files and directories matched by .dockerignore patterns", () => {
    fs.writeFileSync(
      path.join(dir, ".dockerignore"),
      ["node_modules", ".env"].join("\n")
    );

    const files = getFilesInBuildContextDirectory(dir);
    const actual = filterFilesWithDockerignore(dir, files).sort();

    // node_modules/** and .env are excluded; the .dockerignore file itself
    // was already dropped by getFilesInBuildContextDirectory.
    expect(actual).toEqual(["server.py", "keep.env.example"].sort());
  });

  it("respects negation patterns to re-include a specific path", () => {
    // Negating a path whose parent directory is itself excluded doesn't
    // work (standard gitignore/dockerignore limitation) - the exclude
    // pattern has to target the directory's contents (node_modules/*)
    // rather than the directory itself for a child negation to apply.
    fs.writeFileSync(
      path.join(dir, ".dockerignore"),
      ["node_modules/*", "!node_modules/some-dep"].join("\n")
    );

    const files = getFilesInBuildContextDirectory(dir);
    const actual = filterFilesWithDockerignore(dir, files).sort();

    expect(actual).toEqual(
      [
        "server.py",
        ".env",
        "keep.env.example",
        path.join("node_modules", "some-dep", "index.js"),
      ].sort()
    );
  });
});
