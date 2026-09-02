"use strict";

const jestExpect = expect;

// Regression test for a real incident: an empty/undefined projectId
// reaching removeProjectById() previously went straight into
// removeAllTestNamespaces()'s list/delete calls. Scaleway's list APIs
// treat a missing project_id filter as an unscoped default (returning
// some other real project's resources), not as "match nothing" - so this
// deleted real, non-test registry namespaces in an unrelated project.
// projectId ends up undefined here whenever the async project-creation
// call inside a test file's own beforeAll throws before assigning it -
// Jest still runs afterAll (and therefore removeProjectById) regardless.
describe("removeProjectById", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.resetModules();
  });

  it.each([undefined, null, ""])(
    "refuses to act and never calls the Scaleway API when projectId is %p",
    async (projectId) => {
      jest.doMock("../../shared/api", () => ({
        AccountApi: jest.fn(() => ({
          listProjects: jest.fn(),
          deleteProject: jest.fn(),
        })),
        FunctionApi: jest.fn(() => ({
          listNamespaces: jest.fn(),
          deleteNamespace: jest.fn(),
          waitNamespaceIsDeleted: jest.fn(),
        })),
        ContainerApi: jest.fn(() => ({
          listNamespaces: jest.fn(),
          deleteNamespace: jest.fn(),
          waitNamespaceIsDeleted: jest.fn(),
        })),
        RegistryApi: jest.fn(() => ({
          listRegistryNamespace: jest.fn(),
          deleteRegistryNamespace: jest.fn(),
        })),
      }));

      const { removeProjectById } = require("../utils/clean-up");
      const {
        FunctionApi,
        ContainerApi,
        RegistryApi,
        AccountApi,
      } = require("../../shared/api");

      await removeProjectById(projectId);

      jestExpect(FunctionApi).not.toHaveBeenCalled();
      jestExpect(ContainerApi).not.toHaveBeenCalled();
      jestExpect(RegistryApi).not.toHaveBeenCalled();
      jestExpect(
        AccountApi.mock.results[0].value.deleteProject,
      ).not.toHaveBeenCalled();
      jestExpect(consoleErrorSpy).toHaveBeenCalledWith(
        jestExpect.stringContaining("refusing to act"),
      );

      jest.dontMock("../../shared/api");
    },
  );
});
