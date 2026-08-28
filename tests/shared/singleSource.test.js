"use strict";

const { expect, describe, it } = require("@jest/globals");

const singleSource = require("../../shared/singleSource");

describe("getElementsToDelete", () => {
  const existingServicesOnApi = [
    { id: "id-1", name: "keep-me" },
    { id: "id-2", name: "prune-me" },
  ];

  it("does nothing when singleSource is not enabled", () => {
    const actual = singleSource.getElementsToDelete(
      false,
      existingServicesOnApi,
      ["keep-me"],
    );

    expect(actual.elementsIdsToRemove).toEqual([]);
  });

  it("does nothing when singleSource is undefined", () => {
    const actual = singleSource.getElementsToDelete(
      undefined,
      existingServicesOnApi,
      ["keep-me"],
    );

    expect(actual.elementsIdsToRemove).toEqual([]);
  });

  it("does nothing when singleSource is null", () => {
    const actual = singleSource.getElementsToDelete(
      null,
      existingServicesOnApi,
      ["keep-me"],
    );

    expect(actual.elementsIdsToRemove).toEqual([]);
  });

  it("flags API resources that are no longer declared in serverless.yml for removal", () => {
    const actual = singleSource.getElementsToDelete(
      true,
      existingServicesOnApi,
      ["keep-me"],
    );

    expect(actual.elementsIdsToRemove).toEqual(["id-2"]);
  });

  it("removes nothing when every API resource is still declared", () => {
    const actual = singleSource.getElementsToDelete(
      true,
      existingServicesOnApi,
      ["keep-me", "prune-me"],
    );

    expect(actual.elementsIdsToRemove).toEqual([]);
  });

  it("flags everything for removal when serverless.yml declares no services", () => {
    const actual = singleSource.getElementsToDelete(
      true,
      existingServicesOnApi,
      [],
    );

    expect(actual.elementsIdsToRemove).toEqual(["id-1", "id-2"]);
  });
});
