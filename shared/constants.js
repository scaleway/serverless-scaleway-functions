'use strict';

const FUNCTIONS_API_URL = process.env.SCW_FUNCTION_URL || 'https://api.scaleway.com/functions/v1beta1/regions/fr-par';
const CONTAINERS_API_URL = process.env.SCW_CONTAINER_URL || 'https://api.scaleway.com/containers/v1beta1/regions/fr-par';
const REGISTRY_API_URL = 'https://api.scaleway.com/registry/v1beta2/regions/fr-par/';

const PRIVACY_PRIVATE = 'private';

module.exports = {
  FUNCTIONS_API_URL,
  CONTAINERS_API_URL,
  REGISTRY_API_URL,
  PRIVACY_PRIVATE,
};
