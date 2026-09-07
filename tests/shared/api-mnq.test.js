"use strict";

const jestExpect = expect;

const MnqApi = require("../../shared/api/mnq");

// MnqApi's constructor builds a real (lazily-resolved) SDK client, so these
// tests call the prototype methods directly with a fake `this` (sqsApi/
// natsApi mocked) - same pattern api-registry.test.js uses.
describe("deleteSqsCredentialsByName parameter validation", () => {
  // Regression test: triggers.ts's deleteMessageTrigger falls back to
  // provider.getScwProject()! (a non-null assertion) for the sqs/nats
  // credential cleanup path - that can legitimately be empty/undefined on
  // misconfigured credentials, so this must fail fast rather than listing
  // credentials with an unscoped filter.
  it.each([undefined, null, ""])(
    "throws instead of calling the SDK when projectId is %p",
    async (projectId) => {
      const listSqsCredentials = jest.fn();
      const ctx = { sqsApi: { listSqsCredentials } };

      await jestExpect(
        MnqApi.prototype.deleteSqsCredentialsByName.call(
          ctx,
          projectId,
          "cred-name",
        ),
      ).rejects.toThrow("projectId must not be empty");
      jestExpect(listSqsCredentials).not.toHaveBeenCalled();
    },
  );
});

describe("deleteNatsCredentialsByName parameter validation", () => {
  it.each([undefined, null, ""])(
    "throws instead of calling the SDK when projectId is %p",
    async (projectId) => {
      const listNatsCredentials = jest.fn();
      const ctx = { natsApi: { listNatsCredentials } };

      await jestExpect(
        MnqApi.prototype.deleteNatsCredentialsByName.call(
          ctx,
          projectId,
          "cred-name",
        ),
      ).rejects.toThrow("projectId must not be empty");
      jestExpect(listNatsCredentials).not.toHaveBeenCalled();
    },
  );
});
