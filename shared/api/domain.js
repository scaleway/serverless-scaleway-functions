'use strict';

const { manageError } = require('./utils');

const util = require('util')

module.exports = {
  listDomains(functionId) {
    const domainsUrl = `domains?function_id=${functionId}`;

    return this.apiManager.get(domainsUrl)
    .then(response => response.data.domains)
    .catch(manageError);
  },

  createDomain(params) {
    return this.apiManager.post('domains', params)
      .then(response => response.data)
      .catch(manageError);
  },

  deleteDomain(domainID) {
    const updateUrl = `domains/${domainID}`;
    return this.apiManager.delete(updateUrl)
      .then(response => response.data)
      .catch(manageError);
  },

};
