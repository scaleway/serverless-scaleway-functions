"use strict";

const jestExpect = expect;
const fs = require("fs");
const https = require("https");
const path = require("path");

const { getApiManager } = require("../../shared/api/utils");

const key = fs.readFileSync(
  path.join(__dirname, "fixtures", "self-signed-key.pem"),
);
const cert = fs.readFileSync(
  path.join(__dirname, "fixtures", "self-signed-cert.pem"),
);

describe("getApiManager", () => {
  let server;
  let baseURL;

  beforeAll((done) => {
    server = https.createServer({ key, cert }, (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    server.listen(0, "127.0.0.1", () => {
      baseURL = `https://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it("rejects self-signed certificates instead of trusting any TLS endpoint", async () => {
    const apiManager = getApiManager(baseURL, "some-token");

    await jestExpect(apiManager.get("/")).rejects.toThrow(
      /certificate|self.signed/i,
    );
  });
});
