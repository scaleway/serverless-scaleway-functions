"use strict";

const { manageError } = require("./utils");

module.exports = {
  /**
   * listDomains is used to read all domains of a wanted function.
   * @param {Number} functionId the id of the function to read domains.
   * @returns a Promise with request result.
   */
  listDomainsFunction(functionId) {
    const domainsUrl = `domains?function_id=${functionId}`;

    return this.apiManager
      .get(domainsUrl)
      .then((response) => response.data.domains)
      .catch(manageError);
  },

  /**
   * listDomains is used to read all domains of a wanted container.
   * @param {Number} containerId the id of the container to read domains.
   * @returns a Promise with request result.
   */
   listDomainsContainer(containerId) {
    const domainsUrl = `domains?container_id=${containerId}`;

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

  /**
   * Waiting for all domains to be ready on a function
   * @param {UUID} functionId
   * @returns
   */
  waitDomainsAreDeployedFunction(functionId) {
    return this.listDomainsFunction(functionId)
      .then((domains) => {
        let domainsAreReady = true;

        for (let i = 0; i < domains.length; i += 1) {
          const domain = domains[i];

          if (domain.status === 'error') {
            throw new Error(domain.error_message);
          }

          if (domain.status !== 'ready') {
            domainsAreReady = false;
            break;
          }
        }
        if (!domainsAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitDomainsAreDeployedFunction(functionId)), 5000);
          });
        }
        return domains;
      });
  },

  /**
  * Waiting for all domains to be ready on a container
  * @param {UUID} containerId
  * @returns
  */
  waitDomainsAreDeployedContainer(containerId) {
    return this.listDomainsContainer(containerId)
      .then((domains) => {
        let domainsAreReady = true;

        for (let i = 0; i < domains.length; i += 1) {
          const domain = domains[i];

          if (domain.status === 'error') {
            throw new Error(domain.error_message);
          }

          if (domain.status !== 'ready') {
            domainsAreReady = false;
            break;
          }
        }
        if (!domainsAreReady) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.waitDomainsAreDeployedContainer(containerId)), 5000);
          });
        }
        return domains;
      });
  },
  
};
