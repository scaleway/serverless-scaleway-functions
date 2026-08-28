import type { Accountv3 } from "@scaleway/sdk-account";

interface Project {
  id: string;
  name: string;
  organization_id: string;
  [key: string]: unknown;
}

interface AccountSdkContext {
  sdkApi: Pick<
    Accountv3.ProjectAPI,
    "listProjects" | "deleteProject" | "createProject"
  >;
}

export async function listProjects(
  this: AccountSdkContext,
  organizationId: string,
): Promise<Project[]> {
  const projects = await this.sdkApi.listProjects({ organizationId }).all();
  return projects.map((project) => ({
    ...project,
    organization_id: project.organizationId,
  }));
}

export async function deleteProject(
  this: AccountSdkContext,
  projectId: string,
): Promise<void> {
  await this.sdkApi.deleteProject({ projectId });
}

export async function createProject(
  this: AccountSdkContext,
  params: { name: string; organization_id: string },
): Promise<Project> {
  const project = await this.sdkApi.createProject({
    name: params.name,
    organizationId: params.organization_id,
    description: "",
  });
  return { ...project, organization_id: project.organizationId };
}
