import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface Project {
  id: string;
  name: string;
  organization_id: string;
  [key: string]: unknown;
}

export function listProjects(this: ApiManagerContext, organizationId: string) {
  return this.apiManager
    .get<{ projects: Project[] }>(
      `?organization_id=${organizationId}&page_size=50&order_by=created_at_desc`,
    )
    .then((response) => response.data.projects)
    .catch(manageError);
}

export function deleteProject(this: ApiManagerContext, projectId: string) {
  return this.apiManager.delete(`${projectId}`).catch(manageError);
}

export function createProject(
  this: ApiManagerContext,
  params: { name: string; organization_id: string },
): Promise<Project> {
  return this.apiManager
    .post<Project>("", params)
    .then((response) => response.data)
    .catch(manageError);
}
