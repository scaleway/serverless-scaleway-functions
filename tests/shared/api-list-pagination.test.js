"use strict";

const jestExpect = expect;

const functionsApi = require("../../shared/api/functions");
const containersApi = require("../../shared/api/containers");
const namespacesApi = require("../../shared/api/namespaces");

function page(count, offset) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${offset + i}`,
  }));
}

function parsePage(url) {
  const match = url.match(/[?&]page=(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

describe("listFunctions pagination", () => {
  it("keeps fetching while a page comes back full, and aggregates every page", async () => {
    const calledUrls = [];
    const ctx = {
      ...functionsApi,
      apiManager: {
        get: (url) => {
          calledUrls.push(url);
          const p = parsePage(url);
          if (p === 1) {
            return Promise.resolve({ data: { functions: page(100, 0) } });
          }
          if (p === 2) {
            return Promise.resolve({ data: { functions: page(30, 100) } });
          }
          throw new Error(`unexpected page ${p}`);
        },
      },
    };

    const result = await functionsApi.listFunctions.call(ctx, "ns-1");

    jestExpect(result).toHaveLength(130);
    jestExpect(result[0]).toEqual({ id: "item-0" });
    jestExpect(result[129]).toEqual({ id: "item-129" });
    jestExpect(calledUrls).toHaveLength(2);
    jestExpect(calledUrls[0]).toContain("page=1");
    jestExpect(calledUrls[1]).toContain("page=2");
  });

  it("stops after a single page when it comes back under the page size", async () => {
    const ctx = {
      ...functionsApi,
      apiManager: {
        get: () => Promise.resolve({ data: { functions: page(3, 0) } }),
      },
    };

    const result = await functionsApi.listFunctions.call(ctx, "ns-1");

    jestExpect(result).toHaveLength(3);
  });
});

describe("listContainers pagination", () => {
  it("keeps fetching while a page comes back full, and aggregates every page", async () => {
    const ctx = {
      ...containersApi,
      apiManager: {
        get: (url) => {
          const p = parsePage(url);
          if (p === 1) {
            return Promise.resolve({ data: { containers: page(100, 0) } });
          }
          return Promise.resolve({ data: { containers: page(1, 100) } });
        },
      },
    };

    const result = await containersApi.listContainers.call(ctx, "ns-1");

    jestExpect(result).toHaveLength(101);
  });
});

describe("listNamespaces pagination", () => {
  it("keeps fetching while a page comes back full, and aggregates every page", async () => {
    const ctx = {
      ...namespacesApi,
      apiManager: {
        get: (url) => {
          const p = parsePage(url);
          if (p === 1) {
            return Promise.resolve({ data: { namespaces: page(100, 0) } });
          }
          return Promise.resolve({ data: { namespaces: page(5, 100) } });
        },
      },
    };

    const result = await namespacesApi.listNamespaces.call(ctx, "project-1");

    jestExpect(result).toHaveLength(105);
  });
});
