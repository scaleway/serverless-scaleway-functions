import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface Runtime {
  name: string;
  language: string;
  status: string;
  status_message?: string;
  [key: string]: unknown;
}

export function listRuntimes(this: ApiManagerContext): Promise<Runtime[]> {
  const functionsUrl = `runtimes`;
  return this.apiManager
    .get<{ runtimes: Runtime[] }>(functionsUrl)
    .then((response) => response.data.runtimes || [])
    .catch(manageError);
}
