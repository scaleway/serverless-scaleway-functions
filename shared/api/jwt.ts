import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface JwtResponse {
  token?: string;
  [key: string]: unknown;
}

export function issueJwtNamespace(
  this: ApiManagerContext,
  namespaceId: string,
  expirationDate: string,
): Promise<JwtResponse> {
  const jwtUrl = `issue-jwt?namespace_id=${namespaceId}&expiration_date=${expirationDate}`;
  return this.apiManager
    .get<JwtResponse>(jwtUrl)
    .then((response) => response.data || {})
    .catch(manageError);
}

export function issueJwtFunction(
  this: ApiManagerContext,
  functionId: string,
  expirationDate: string,
): Promise<JwtResponse> {
  const jwtUrl = `issue-jwt?function_id=${functionId}&expiration_date=${expirationDate}`;
  return this.apiManager
    .get<JwtResponse>(jwtUrl)
    .then((response) => response.data || {})
    .catch(manageError);
}

export function issueJwtContainer(
  this: ApiManagerContext,
  containerId: string,
  expirationDate: string,
): Promise<JwtResponse> {
  const jwtUrl = `issue-jwt?container_id=${containerId}&expiration_date=${expirationDate}`;
  return this.apiManager
    .get<JwtResponse>(jwtUrl)
    .then((response) => response.data || {})
    .catch(manageError);
}
