'use strict';

const { manageError } = require('./utils');

const util = require('util')

module.exports = {
  listDomains(functionId) {
    console.log("LIS DOMAINS lol")
    const domainsUrl = `domains?function_id=${functionId}`;

    let res = this.apiManager.get(domainsUrl)
    .then(response => response.data.domains)
    // .then((response) => console.log(util.inspect(response.data.domains, {showHidden: false, depth: null, colors: true})))
    .catch(manageError);
    
    console.log("domain res = ", res)

    return res
  },

  createDomain(params) {
    return this.apiManager.post('domains', params)
      .then(response => response.data)
      .catch(manageError);
  },

  deleteDomain(domainID) {
    const updateUrl = `domains`;
    return this.apiManager.delete(updateUrl, params)
      .then(response => response.data)
      .catch(manageError);
  },

};
