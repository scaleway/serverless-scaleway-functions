"use strict";

const jestExpect = expect;

const { requireNonEmpty } = require("../../shared/api/params");

describe("requireNonEmpty", () => {
  it.each([undefined, null, ""])(
    "throws naming the parameter when the value is %p",
    (value) => {
      jestExpect(() => requireNonEmpty(value, "projectId")).toThrow(
        "projectId must not be empty",
      );
    },
  );

  it("returns the value unchanged when it is a non-empty string", () => {
    jestExpect(requireNonEmpty("proj-1", "projectId")).toBe("proj-1");
  });
});
