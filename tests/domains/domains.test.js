const { describe, it, expect } = require("@jest/globals");
const domainUtils = require("../../shared/domains");

describe("Domain utils tests ", () => {
  // represents the data from serverless.yml file
  const hostnamesInput = ["host1", "host2" ];

  // represents the struct of domains from the API
  const structInput = [
    { id: "id1", hostname: "host1" },
    { id: "id2", hostname: "host2" },
  ];

  it("should format domains", () => {
    const res = domainUtils.formatDomainsStructure(structInput);
    expect(res.length).toBe(2);

    expect(res[0].id).toBe("id1");
    expect(res[0].hostname).toBe("host1");

    expect(res[1].id).toBe("id2");
    expect(res[1].hostname).toBe("host2");
  });

  it("should filters domains that need to be created", () => {
    // existing domains and domains to create are the same so should not return elements
    const domainsToCreateEmpty = domainUtils.getDomainsToCreate(
      hostnamesInput,
      structInput
    );

    expect(domainsToCreateEmpty.length).toBe(0);

    // adding host3
    const domainsToCreateOne = domainUtils.getDomainsToCreate(["host1", "host2", "host3"], structInput);

    expect(domainsToCreateOne.length).toBe(1);
    expect(domainsToCreateOne[0]).toBe("host3");
  });

  it("should filters domains that need to be deleted", () => {
    // existing domains and domains to delete are the same so should not delete anything
    const domainsToDeleteEmpty = domainUtils.getDomainsToDelete(
      hostnamesInput,
      structInput
    );

    expect(domainsToDeleteEmpty.length).toBe(0);

    // removing host 2
    const domainsToDeleteOne = domainUtils.getDomainsToDelete(["host1"], structInput);

    expect(domainsToDeleteOne.length).toBe(1);
    expect(domainsToDeleteOne[0]).toBe("id2");
  });
});
