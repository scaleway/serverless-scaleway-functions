"use strict";

module.exports = {
  getElementsToDelete(singleSourceParam, existingServicesOnApi, servicesNames) {
    const serviceNamesRet = servicesNames;
    const elementsIdsToRemove = [];

    if (
      singleSourceParam !== undefined &&
      singleSourceParam !== null &&
      singleSourceParam === true
    ) {
      // If a container is available in the API but not in the serverlss.yml file, remove it
      for (let i = 0; i < existingServicesOnApi.length; i++) {
        const apiService = existingServicesOnApi[i];

        for (let ii = 0; ii < serviceNamesRet.length; ii++) {
          const serviceName = serviceNamesRet[ii];

          if (apiService === serviceName) {
            serviceNamesRet.slice(ii, 1);
            break;
          }
        }

        if (!serviceNamesRet.includes(apiService.name)) {
          elementsIdsToRemove.push(apiService.id);
        }
      }
    }

    return {
      serviceNamesRet,
      elementsIdsToRemove,
    };
  },
};
