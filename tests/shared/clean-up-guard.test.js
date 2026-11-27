"use strict";

const { describe, it, expect } = require("@jest/globals");

// Every list/delete call removeProjectById() could make is recorded here;
// a missing projectId must not produce a single one.
const mockCalls = [];

jest.mock("../../shared/api", () => {
  const record = (name) =>
    jest.fn((...args) => {
      mockCalls.push([name, ...args]);
      return Promise.resolve([]);
    });
  const fakeApi = () => ({
    listProjects: record("listProjects"),
    deleteProject: record("deleteProject"),
    listNamespaces: record("listNamespaces"),
    deleteNamespace: record("deleteNamespace"),
    waitNamespaceIsDeleted: record("waitNamespaceIsDeleted"),
    listRegistryNamespace: record("listRegistryNamespace"),
    deleteRegistryNamespace: record("deleteRegistryNamespace"),
  });
  return {
    AccountApi: jest.fn(fakeApi),
    FunctionApi: jest.fn(fakeApi),
    ContainerApi: jest.fn(fakeApi),
    RegistryApi: jest.fn(fakeApi),
  };
});

describe("removeProjectById", () => {
  it.each([undefined, null, ""])(
    "lists and deletes nothing when projectId is %p",
    async (projectId) => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { removeProjectById } = require("../utils/clean-up");

      await removeProjectById(projectId);

      expect(mockCalls).toEqual([]);
      errorSpy.mockRestore();
    }
  );
});
