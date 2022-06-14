"use strict";

const { manageError } = require("./utils");

module.exports = {
  /**
   * listDomains is used to read all domains of a wanted function.
   * @param {Number} functionId the id of the function to read domains. 
   * @returns a Promise with request result.
   */
  listDomains(functionId) {
    const domainsUrl = `domains?function_id=${functionId}`;

    return this.apiManager
      .get(domainsUrl)
      .then((response) => response.data.domains)
      .catch(manageError);
  },

  /**
   * createDomain is used to call for domain creation, warning : this
   * function does not wait for the domain
   * to be ready.
   * @param {function_id, hostname} params is an object that contains
   * the "function_id" and "hostname".
   * @returns Promise with create request result.
   */
  createDomain(params) {
    return this.apiManager
      .post("domains", params)
      .then((response) => response.data)
      .catch(manageError);
  },

  /**
   * deleteDomains is used to destroy an existing domain by it's ID.
   * @param {Number} domainID ID of the selected domain. 
   * @returns 
   */
  deleteDomain(domainID) {
    const updateUrl = `domains/${domainID}`;

    return this.apiManager
      .delete(updateUrl)
      .then((response) => response.data)
      .catch(manageError);
  },

  waitDomainsAreDeployed(functionId) {
    return this.listDomains(functionId)
      .then((domains) => {
        let domainssAreReady = true;
        for (let i = 0; i < domains.length; i += 1) {
          const domains = domains[i];
          if (domain.status === 'error') {
            throw new Error(domain.error_message);
          }
          if (domain.status !== 'ready') {
            domainssAreReady = false;
            break;
          }
        }
        if (!domainssAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitDomainsAreDeployed(functionId)), 5000);
          });
        }
        return domains;
      });
  },
};
