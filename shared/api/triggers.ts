interface Trigger {
  id: string;
  args?: Record<string, unknown>;
  schedule?: string;
  [key: string]: unknown;
}

type TriggerParams = Record<string, unknown>;

interface SdkListResponse<T> {
  all(): Promise<T[]>;
}

interface TriggerSdkApi {
  // Same real per-product ID-field-name mismatch as domain.ts's
  // createDomain (functionId vs containerId) - Record<string, unknown> is
  // a deliberate, narrow escape hatch here too, not a general pattern.
  listCrons(request: Record<string, unknown>): SdkListResponse<Trigger>;
  listTriggers(request: Record<string, unknown>): SdkListResponse<Trigger>;
  createCron(request: Record<string, unknown>): Promise<Trigger>;
  createTrigger(request: Record<string, unknown>): Promise<Trigger>;
  updateCron(request: Record<string, unknown>): Promise<Trigger>;
  deleteCron(request: { cronId: string }): Promise<Trigger>;
  deleteTrigger(request: { triggerId: string }): Promise<Trigger>;
}

interface TriggerSdkContext {
  sdkApi: TriggerSdkApi;
}

export async function listTriggersForApplication(
  this: TriggerSdkContext,
  applicationId: string,
  isFunction: boolean,
): Promise<Trigger[]> {
  const ownerIdField = isFunction ? "functionId" : "containerId";

  const cronTriggers = await this.sdkApi
    .listCrons({ [ownerIdField]: applicationId })
    .all();
  const messageTriggers = await this.sdkApi
    .listTriggers({ [ownerIdField]: applicationId })
    .all();

  return [...cronTriggers, ...messageTriggers];
}

export async function createCronTrigger(
  this: TriggerSdkContext,
  applicationId: string,
  isFunction: boolean,
  params: TriggerParams,
): Promise<Trigger> {
  const ownerIdField = isFunction ? "functionId" : "containerId";
  return this.sdkApi.createCron({
    [ownerIdField]: applicationId,
    schedule: params.schedule,
    args: params.args,
  });
}

export async function createMessageTrigger(
  this: TriggerSdkContext,
  applicationId: string,
  isFunction: boolean,
  params: TriggerParams,
): Promise<Trigger> {
  const ownerIdField = isFunction ? "functionId" : "containerId";

  const request: Record<string, unknown> = {
    [ownerIdField]: applicationId,
    name: params.name,
  };

  if (params.scw_nats_config) {
    const nats = params.scw_nats_config as Record<string, unknown>;
    request.scwNatsConfig = {
      subject: nats.subject,
      mnqNatsAccountId: nats.mnq_nats_account_id,
      mnqProjectId: nats.mnq_project_id,
      mnqRegion: nats.mnq_region,
    };
  }

  if (params.scw_sqs_config) {
    const sqs = params.scw_sqs_config as Record<string, unknown>;
    request.scwSqsConfig = {
      queue: sqs.queue,
      mnqProjectId: sqs.mnq_project_id,
      mnqRegion: sqs.mnq_region,
    };
  }

  return this.sdkApi.createTrigger(request);
}

export async function updateCronTrigger(
  this: TriggerSdkContext,
  triggerId: string,
  params: TriggerParams,
): Promise<Trigger> {
  return this.sdkApi.updateCron({
    cronId: triggerId,
    schedule: params.schedule,
    args: params.args,
  });
}

export async function deleteCronTrigger(
  this: TriggerSdkContext,
  triggerId: string,
): Promise<Trigger> {
  return this.sdkApi.deleteCron({ cronId: triggerId });
}

export async function deleteMessageTrigger(
  this: TriggerSdkContext,
  triggerId: string,
): Promise<Trigger> {
  return this.sdkApi.deleteTrigger({ triggerId });
}
