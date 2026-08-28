// import X = require("Y") throughout - see the comment at the top of
// index.ts for why.
import type { AxiosInstance } from "axios";
import utils = require("./utils");
const { getApiManager, manageError } = utils;

interface RegistryNamespace {
  id: string;
  name: string;
  project_id: string;
  [key: string]: unknown;
}

class RegistryApi {
  apiManager: AxiosInstance;

  constructor(registryApiUrl: string, token: string) {
    this.apiManager = getApiManager(registryApiUrl, token);
  }

  listRegistryNamespace(projectId: string): Promise<RegistryNamespace[]> {
    return this.apiManager
      .get<{ namespaces: RegistryNamespace[] }>(
        `namespaces?project_id=${projectId}`,
      )
      .then((response) => response.data.namespaces)
      .catch(manageError);
  }

  deleteRegistryNamespace(namespaceId: string): Promise<RegistryNamespace> {
    return this.apiManager
      .delete<RegistryNamespace>(`namespaces/${namespaceId}`)
      .then((response) => response.data)
      .catch(manageError);
  }

  createRegistryNamespace(params: {
    name: string;
    project_id: string;
  }): Promise<RegistryNamespace> {
    return this.apiManager
      .post<RegistryNamespace>("namespaces", params)
      .then((response) => response.data)
      .catch(manageError);
  }
}

export = RegistryApi;
