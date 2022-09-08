const { describe, it } = require("@jest/globals");
const { expect } = require("chai");
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
    expect(res.length).to.be.eq(2);

    expect(res[0].id).to.be.eq("id1");
    expect(res[0].hostname).to.be.eq("host1");

    expect(res[1].id).to.be.eq("id2");
    expect(res[1].hostname).to.be.eq("host2");
  });

  it("should filters domains that need to be created", () => {
    // existing domains and domains to create are the same so should not return elements
    const domainsToCreateEmpty = domainUtils.getDomainsToCreate(
      hostnamesInput,
      structInput
    );

    expect(domainsToCreateEmpty.length).to.be.eq(0);

    // adding host3
    const domainsToCreateOne = domainUtils.getDomainsToCreate(["host1", "host2", "host3"], structInput);

    expect(domainsToCreateOne.length).to.be.eq(1);
    expect(domainsToCreateOne[0]).to.be.eq("host3");
  });

  it("should filters domains that need to be deleted", () => {
    // existing domains and domains to delete are the same so should not delete anything
    const domainsToDeleteEmpty = domainUtils.getDomainsToDelete(
      hostnamesInput,
      structInput
    );

    expect(domainsToDeleteEmpty.length).to.be.eq(0);

    // removing host 2
    const domainsToDeleteOne = domainUtils.getDomainsToDelete(["host1"], structInput);

    expect(domainsToDeleteOne.length).to.be.eq(1);
    expect(domainsToDeleteOne[0]).to.be.eq("id2");
  });
});
