import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface Namespace {
  id: string;
  name: string;
  status: string;
  error_message?: string;
  [key: string]: unknown;
}

interface NamespaceApi extends ApiManagerContext {
  listNamespaces(
    projectId: string | undefined,
    page?: number,
    accumulated?: Namespace[],
  ): Promise<Namespace[]>;
  getNamespace(namespaceId: string): Promise<Namespace>;
  waitNamespaceIsReady(
    namespaceId: string,
    attempt?: number,
  ): Promise<Namespace>;
  waitNamespaceIsDeleted(
    namespaceId: string,
    attempt?: number,
  ): Promise<boolean>;
}

const LIST_PAGE_SIZE = 100;
const POLL_INTERVAL_MS = 1000;
// ~10 minutes at POLL_INTERVAL_MS before giving up on a stuck wait.
const MAX_POLL_ATTEMPTS = 600;

export function listNamespaces(
  this: NamespaceApi,
  projectId: string | undefined,
  page = 1,
  accumulated: Namespace[] = [],
): Promise<Namespace[]> {
  const projectIdReq =
    projectId === undefined ? "" : `&project_id=${projectId}`;
  return this.apiManager
    .get<{ namespaces: Namespace[] }>(
      `namespaces?page=${page}&page_size=${LIST_PAGE_SIZE}${projectIdReq}`,
    )
    .then((response) => {
      const namespaces = response.data.namespaces || [];
      const all = accumulated.concat(namespaces);

      if (namespaces.length < LIST_PAGE_SIZE) {
        return all;
      }

      return this.listNamespaces(projectId, page + 1, all);
    })
    .catch(manageError);
}

export function getNamespaceFromList(
  this: ApiManagerContext,
  namespaceName: string,
  projectId: string | undefined,
): Promise<Namespace> {
  const projectIdReq =
    projectId === undefined ? "" : `&project_id=${projectId}`;
  // query Scaleway API to check if space exists
  return this.apiManager
    .get<{ namespaces: Namespace[] }>(
      `namespaces?name=${namespaceName}${projectIdReq}`,
    )
    .then((response) => {
      const { namespaces } = response.data;
      return namespaces[0];
    })
    .catch(manageError);
}

export function getNamespace(
  this: ApiManagerContext,
  namespaceId: string,
): Promise<Namespace> {
  return this.apiManager
    .get<Namespace>(`namespaces/${namespaceId}`)
    .then((response) => response.data)
    .catch(manageError);
}

export function waitNamespaceIsReady(
  this: NamespaceApi,
  namespaceId: string,
  attempt = 1,
): Promise<Namespace> {
  return this.getNamespace(namespaceId).then((namespace) => {
    if (namespace.status === "error") {
      throw new Error(namespace.error_message);
    }
    if (namespace.status !== "ready") {
      if (attempt >= MAX_POLL_ATTEMPTS) {
        throw new Error(
          `Timed out waiting for namespace ${namespaceId} to become ready`,
        );
      }
      return new Promise<Namespace>((resolve) => {
        setTimeout(
          () => resolve(this.waitNamespaceIsReady(namespaceId, attempt + 1)),
          POLL_INTERVAL_MS,
        );
      });
    }
    return namespace;
  });
}

export function createNamespace(
  this: ApiManagerContext,
  params: Record<string, unknown>,
): Promise<Namespace> {
  return this.apiManager
    .post<Namespace>("namespaces", params)
    .then((response) => response.data)
    .catch(manageError);
}

export function updateNamespace(
  this: ApiManagerContext,
  namespaceId: string,
  params: Record<string, unknown>,
) {
  return this.apiManager
    .patch(`namespaces/${namespaceId}`, params)
    .catch(manageError);
}

export function deleteNamespace(
  this: ApiManagerContext,
  namespaceId: string,
): Promise<Namespace> {
  return this.apiManager
    .delete<Namespace>(`namespaces/${namespaceId}`)
    .then((response) => response.data)
    .catch(manageError);
}

export function waitNamespaceIsDeleted(
  this: NamespaceApi,
  namespaceId: string,
  attempt = 1,
): Promise<boolean> {
  return this.getNamespace(namespaceId)
    .then((response) => {
      if (response && response.status === "deleting") {
        if (attempt >= MAX_POLL_ATTEMPTS) {
          throw new Error(
            `Timed out waiting for namespace ${namespaceId} to be deleted`,
          );
        }
        return new Promise<boolean>((resolve) => {
          setTimeout(
            () =>
              resolve(this.waitNamespaceIsDeleted(namespaceId, attempt + 1)),
            POLL_INTERVAL_MS,
          );
        });
      }
      return true;
    })
    .catch((err) => {
      if (err.response && err.response.status === 404) {
        return true;
      }
      throw new Error(
        `An error occured during namespace deletion: ${err.message}`,
      );
    });
}
