"use strict";

const { expect: jestExpect, describe, it } = require("@jest/globals");

const deployContainers = require("../../deploy/lib/deployContainers");

function deferred() {
  let resolveFn;
  let settled = false;
  const promise = new Promise((resolve) => {
    resolveFn = resolve;
  }).then(() => {
    settled = true;
  });
  return {
    resolveWith: (value) => resolveFn(value),
    promise,
    isSettled: () => settled,
  };
}

describe("printContainerEndpointsAfterDeployment", () => {
  it("waits for every container's domain deployment check to actually complete", async () => {
    const domainsA = deferred();
    const domainsB = deferred();
    const byContainer = { "container-a": domainsA, "container-b": domainsB };

    const ctx = {
      namespace: { id: "ns-1" },
      serverless: { cli: { log: () => {} } },
      waitContainersAreDeployed: () =>
        Promise.resolve([
          { id: "container-a", name: "a", domain_name: "a.example.com" },
          { id: "container-b", name: "b", domain_name: "b.example.com" },
        ]),
      waitDomainsAreDeployedContainer: (id) =>
        byContainer[id].promise.then(() => [{ hostname: `${id}.example.com` }]),
    };

    const resultPromise =
      deployContainers.printContainerEndpointsAfterDeployment.call(ctx);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jestExpect(domainsA.isSettled()).toBe(false);
    jestExpect(domainsB.isSettled()).toBe(false);

    domainsA.resolveWith();
    domainsB.resolveWith();
    await resultPromise;

    jestExpect(domainsA.isSettled()).toBe(true);
    jestExpect(domainsB.isSettled()).toBe(true);
  });

  it("propagates a domain deployment failure instead of swallowing it", async () => {
    const ctx = {
      namespace: { id: "ns-1" },
      serverless: { cli: { log: () => {} } },
      waitContainersAreDeployed: () =>
        Promise.resolve([
          { id: "container-a", name: "a", domain_name: "a.example.com" },
        ]),
      waitDomainsAreDeployedContainer: () =>
        Promise.reject(new Error("domain error")),
    };

    await jestExpect(
      deployContainers.printContainerEndpointsAfterDeployment.call(ctx)
    ).rejects.toThrow("domain error");
  });
});
