import { manageError } from "./utils";
import type { ApiManagerContext } from "./types";

interface Trigger {
  id: string;
  args?: Record<string, unknown>;
  schedule?: string;
  [key: string]: unknown;
}

type TriggerParams = Record<string, unknown>;

export async function listTriggersForApplication(
  this: ApiManagerContext,
  applicationId: string,
  isFunction: boolean,
): Promise<Trigger[]> {
  let cronTriggersUrl = `crons?function_id=${applicationId}`;
  if (!isFunction) {
    cronTriggersUrl = `crons?container_id=${applicationId}`;
  }

  const cronTriggers = await this.apiManager
    .get<{ crons: Trigger[] }>(cronTriggersUrl)
    .then((response) => response.data.crons)
    .catch(manageError);

  let messageTriggersUrl = `triggers?function_id=${applicationId}`;
  if (!isFunction) {
    messageTriggersUrl = `triggers?container_id=${applicationId}`;
  }

  const messageTriggers = await this.apiManager
    .get<{ triggers: Trigger[] }>(messageTriggersUrl)
    .then((response) => response.data.triggers)
    .catch(manageError);

  return [...cronTriggers, ...messageTriggers];
}

export function createCronTrigger(
  this: ApiManagerContext,
  applicationId: string,
  isFunction: boolean,
  params: TriggerParams,
): Promise<Trigger> {
  let payload: TriggerParams & {
    function_id?: string;
    container_id?: string;
  } = {
    ...params,
    function_id: applicationId,
  };

  if (!isFunction) {
    payload = {
      ...params,
      container_id: applicationId,
    };
  }
  return this.apiManager
    .post<Trigger>("crons", payload)
    .then((response) => response.data)
    .catch(manageError);
}

export function createMessageTrigger(
  this: ApiManagerContext,
  applicationId: string,
  isFunction: boolean,
  params: TriggerParams,
): Promise<Trigger> {
  let payload: TriggerParams & {
    function_id?: string;
    container_id?: string;
  } = {
    ...params,
    function_id: applicationId,
  };

  if (!isFunction) {
    payload = {
      ...params,
      container_id: applicationId,
    };
  }
  return this.apiManager
    .post<Trigger>("triggers", payload)
    .then((response) => response.data)
    .catch(manageError);
}

export function updateCronTrigger(
  this: ApiManagerContext,
  triggerId: string,
  params: TriggerParams,
): Promise<Trigger> {
  const updateUrl = `crons/${triggerId}`;
  return this.apiManager
    .patch<Trigger>(updateUrl, params)
    .then((response) => response.data)
    .catch(manageError);
}

export function deleteCronTrigger(
  this: ApiManagerContext,
  triggerId: string,
): Promise<Trigger> {
  return this.apiManager
    .delete<Trigger>(`crons/${triggerId}`)
    .then((response) => response.data)
    .catch(manageError);
}

export function deleteMessageTrigger(
  this: ApiManagerContext,
  triggerId: string,
): Promise<Trigger> {
  return this.apiManager
    .delete<Trigger>(`triggers/${triggerId}`)
    .then((response) => response.data)
    .catch(manageError);
}
