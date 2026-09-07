"use strict";

const jestExpect = expect;

const accountApi = require("../../shared/api/account");

describe("listProjects field aliasing", () => {
  it("maps organizationId to organization_id for every project", async () => {
    const ctx = {
      sdkApi: {
        listProjects: () => ({
          all: () =>
            Promise.resolve([
              { id: "proj-1", name: "my-project", organizationId: "org-1" },
            ]),
        }),
      },
    };

    const [result] = await accountApi.listProjects.call(ctx, "org-1");

    jestExpect(result.organization_id).toBe("org-1");
  });
});

describe("createProject", () => {
  it("maps organization_id to organizationId in the request and back in the response", async () => {
    let capturedRequest;
    const ctx = {
      sdkApi: {
        createProject: (request) => {
          capturedRequest = request;
          return Promise.resolve({
            id: "proj-1",
            name: "my-project",
            organizationId: request.organizationId,
          });
        },
      },
    };

    const result = await accountApi.createProject.call(ctx, {
      name: "my-project",
      organization_id: "org-1",
    });

    jestExpect(capturedRequest.organizationId).toBe("org-1");
    jestExpect(result.organization_id).toBe("org-1");
  });
});
