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
