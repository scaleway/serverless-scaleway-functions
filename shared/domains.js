"use strict";

module.exports = {
  getDomainsToCreate(customDomains, existingDomains) {
    const domainsToCreate = [];

    if (
      customDomains !== undefined &&
      customDomains !== null &&
      customDomains.length > 0
    ) {
      customDomains.forEach((customDomain) => {
        const domainFounds = existingDomains.filter(
          (existingDomain) => existingDomain.hostname === customDomain
        );

        if (domainFounds.length === 0) {
          domainsToCreate.push(customDomain);
        }
      });
    }

    return domainsToCreate;
  },

  getDomainsToDelete(customDomains, existingDomains) {
    const domainsIdToDelete = [];
    existingDomains.forEach((existingDomain) => {
      if (
        (customDomains === undefined || customDomains === null) &&
        existingDomain.id !== undefined
      ) {
        domainsIdToDelete.push(existingDomain.id);
      } else if (!customDomains.includes(existingDomain.hostname)) {
        domainsIdToDelete.push(existingDomain.id);
      }
    });

    return domainsIdToDelete;
  },

  formatDomainsStructure(domains) {
    const formattedDomains = [];

    domains.forEach((domain) => {
      formattedDomains.push({ hostname: domain.hostname, id: domain.id });
    });

    return formattedDomains;
  },
};
