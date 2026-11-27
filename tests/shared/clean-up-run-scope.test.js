"use strict";

const { describe, it, expect, afterEach } = require("@jest/globals");

const mockDeleted = [];
const mockProjects = [
  { id: "mine", name: "test-slsframework-123-1-abcdef" },
  { id: "other-attempt", name: "test-slsframework-123-2-abcdef" },
  { id: "other-run", name: "test-slsframework-999-1-abcdef" },
  { id: "untagged", name: "test-slsframework-abcdef123456" },
  { id: "unrelated", name: "production" },
];

jest.mock("../../shared/api", () => {
  const fakeApi = () => ({
    listProjects: jest.fn(() => Promise.resolve(mockProjects)),
    deleteProject: jest.fn((id) => {
      mockDeleted.push(id);
      return Promise.resolve();
    }),
    listNamespaces: jest.fn(() => Promise.resolve([])),
    listRegistryNamespace: jest.fn(() => Promise.resolve([])),
  });
  return {
    AccountApi: jest.fn(fakeApi),
    FunctionApi: jest.fn(fakeApi),
    ContainerApi: jest.fn(fakeApi),
    RegistryApi: jest.fn(fakeApi),
  };
});

describe("cleanup", () => {
  const savedRunId = process.env.SCW_TEST_RUN_ID;

  afterEach(() => {
    mockDeleted.length = 0;
    if (savedRunId === undefined) {
      delete process.env.SCW_TEST_RUN_ID;
    } else {
      process.env.SCW_TEST_RUN_ID = savedRunId;
    }
  });

  it("deletes only the projects created by the current run", async () => {
    process.env.SCW_TEST_RUN_ID = "123-1";
    const { cleanup } = require("../utils/clean-up");

    await cleanup();

    expect(mockDeleted).toEqual(["mine"]);
  });

  it("deletes nothing when no run id is set", async () => {
    delete process.env.SCW_TEST_RUN_ID;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { cleanup } = require("../utils/clean-up");

    await cleanup();

    expect(mockDeleted).toEqual([]);
    errorSpy.mockRestore();
  });
});
