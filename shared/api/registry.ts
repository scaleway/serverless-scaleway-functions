import type { Registryv1 } from "@scaleway/sdk-registry";
import sdkClient = require("./sdkClient");
const { createScalewayClientFromResourceUrl, createLazySdkApi } = sdkClient;
import RegistrySdk = require("@scaleway/sdk-registry");
const { Registryv1: RegistryNamespace } = RegistrySdk;

interface RegistryNamespaceRecord {
  id: string;
  name: string;
  project_id: string;
  [key: string]: unknown;
}

class RegistryApi {
  sdkApi: Registryv1.API;

  constructor(registryApiUrl: string, token: string) {
    // Lazy plain-value Proxy, not a `get sdkApi()` accessor - see the long
    // comment on createLazySdkApi in sdkClient.ts. This class isn't
    // currently mixed onto any plugin via Object.assign (it's only ever
    // used directly), but a prototype accessor would silently break the
    // moment that changed, the same way it did for shared/api/index.ts's
    // three classes - keeping the same safe pattern here for consistency.
    this.sdkApi = createLazySdkApi(
      () =>
        new RegistryNamespace.API(
          createScalewayClientFromResourceUrl(registryApiUrl, token),
        ),
    );
  }

  async listRegistryNamespace(
    projectId: string,
  ): Promise<RegistryNamespaceRecord[]> {
    const namespaces = await this.sdkApi.listNamespaces({ projectId }).all();
    return namespaces.map((namespace) => ({
      ...namespace,
      project_id: namespace.projectId,
    }));
  }

  async deleteRegistryNamespace(
    namespaceId: string,
  ): Promise<RegistryNamespaceRecord> {
    const namespace = await this.sdkApi.deleteNamespace({ namespaceId });
    return { ...namespace, project_id: namespace.projectId };
  }

  async createRegistryNamespace(params: {
    name: string;
    project_id: string;
  }): Promise<RegistryNamespaceRecord> {
    const namespace = await this.sdkApi.createNamespace({
      name: params.name,
      projectId: params.project_id,
      description: "",
      isPublic: false,
    });
    return { ...namespace, project_id: namespace.projectId };
  }
}

export = RegistryApi;
