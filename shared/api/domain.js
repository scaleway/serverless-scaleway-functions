"use strict";

const { manageError } = require("./utils");

module.exports = {
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

  createDomainAndLog(createDomainParams, slscli) {
    this.createDomain(createDomainParams)
      .then((res) => {
        slscli.log(`Creating domain ${res.hostname}`);
      })
      .then(
        () => {},
        (reason) => {
          slscli.log(
            `Error on domain : ${createDomainParams.hostname}, reason : ${reason.message}`
          );

          if (reason.message.includes("could not validate")) {
            slscli.log(
              "Ensure CNAME configuration is ok, it can take some time for a record to propagate"
            );
          }
        }
      );
  },
};
