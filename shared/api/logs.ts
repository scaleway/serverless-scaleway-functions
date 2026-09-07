import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface LogLine {
  message: string;
  [key: string]: unknown;
}

export function getLines(
  this: ApiManagerContext,
  application: { id: string; runtime?: string },
): Promise<LogLine[]> {
  let logsUrl = `functions/${application.id}/logs`;
  if (!application.runtime) {
    logsUrl = `containers/${application.id}/logs`;
  }
  return this.apiManager
    .get<{ logs: LogLine[] }>(logsUrl)
    .then((response) => response.data.logs || [])
    .catch(manageError);
}
