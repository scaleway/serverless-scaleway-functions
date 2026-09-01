interface DomainRecord {
  id: string;
  hostname: string;
}

export function getDomainsToCreate(
  customDomains: string[] | undefined | null,
  existingDomains: DomainRecord[],
): string[] {
  const domainsToCreate: string[] = [];

  if (
    customDomains !== undefined &&
    customDomains !== null &&
    customDomains.length > 0
  ) {
    customDomains.forEach((customDomain) => {
      const domainFounds = existingDomains.filter(
        (existingDomain) => existingDomain.hostname === customDomain,
      );

      if (domainFounds.length === 0) {
        domainsToCreate.push(customDomain);
      }
    });
  }

  return domainsToCreate;
}

export function getDomainsToDelete(
  customDomains: string[] | undefined | null,
  existingDomains: DomainRecord[],
): string[] {
  const domainsIdToDelete: string[] = [];
  existingDomains.forEach((existingDomain) => {
    if (customDomains === undefined || customDomains === null) {
      if (existingDomain.id !== undefined) {
        domainsIdToDelete.push(existingDomain.id);
      }
    } else if (!customDomains.includes(existingDomain.hostname)) {
      domainsIdToDelete.push(existingDomain.id);
    }
  });

  return domainsIdToDelete;
}

export function formatDomainsStructure(
  domains: DomainRecord[],
): DomainRecord[] {
  const formattedDomains: DomainRecord[] = [];

  domains.forEach((domain) => {
    formattedDomains.push({ hostname: domain.hostname, id: domain.id });
  });

  return formattedDomains;
}
