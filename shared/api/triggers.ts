import MnqApi = require("./mnq");
import constants = require("../constants");
const { MNQ_API_URL } = constants;

interface Trigger {
  id: string;
  args?: Record<string, unknown>;
  schedule?: string;
  name?: string;
  sourceType?: string;
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
  //
  // listCrons/createCron/updateCron/deleteCron only exist on
  // Functionv1beta1.API - Containerv1.API dropped the separate Cron
  // resource entirely (cron is now sourceType: 'cron' + cronConfig on a
  // Trigger, via the same listTriggers/createTrigger/deleteTrigger calls
  // used for sqs/nats). Every function below branches on `isFunction`
  // before calling any of these, so the two products never actually call
  // a method the other one lacks.
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
  // Only read for isFunction: false (Containers) - see createMessageTrigger/
  // deleteMessageTrigger below. Functions keep using Scaleway-managed
  // scwSqsConfig/scwNatsConfig, which need no credentials of this plugin's
  // own making.
  provider: {
    scwToken?: string;
    getScwProject(): string | undefined;
    getScwRegion(): string | undefined;
  };
}

// Builds an MnqApi client scoped to a specific region - the trigger's own
// mnq_region (an explicit, documented override in docs/events.md, since an
// MNQ resource can live in a different region than the function/container
// being deployed) rather than always the deploy's own region. Getting this
// wrong isn't just a wrong-default: querying the wrong region can 404
// (getNatsAccount) or silently find no matching credential to clean up on
// delete (listSqsCredentials/listNatsCredentials are region-scoped calls).
function mnqApiForRegion(
  provider: TriggerSdkContext["provider"],
  region: string | undefined,
): MnqApi {
  const resolvedRegion = region || provider.getScwRegion();
  return new MnqApi(`${MNQ_API_URL}/${resolvedRegion}/`, provider.scwToken!);
}

export async function listTriggersForApplication(
  this: TriggerSdkContext,
  applicationId: string,
  isFunction: boolean,
): Promise<Trigger[]> {
  if (isFunction) {
    const cronTriggers = await this.sdkApi
      .listCrons({ functionId: applicationId })
      .all();
    const messageTriggers = await this.sdkApi
      .listTriggers({ functionId: applicationId })
      .all();
    return [...cronTriggers, ...messageTriggers];
  }

  // Containers (v1): cron, sqs and nats triggers all come back from the
  // same listTriggers call, distinguished by sourceType. Synthesize the
  // same top-level `.schedule` field the old, separate Cron object used to
  // carry, purely so deploy/lib/deployTriggers.ts's `"schedule" in trigger`
  // branch (deciding whether to call deleteCronTrigger vs
  // deleteMessageTrigger) keeps working unchanged.
  const triggers = await this.sdkApi
    .listTriggers({ containerId: applicationId })
    .all();
  return triggers.map((trigger) =>
    trigger.sourceType === "cron"
      ? {
          ...trigger,
          schedule: (trigger.cronConfig as { schedule?: string } | undefined)
            ?.schedule,
        }
      : trigger,
  );
}

export async function createCronTrigger(
  this: TriggerSdkContext,
  applicationId: string,
  isFunction: boolean,
  params: TriggerParams,
): Promise<Trigger> {
  if (isFunction) {
    return this.sdkApi.createCron({
      functionId: applicationId,
      schedule: params.schedule,
      args: params.args,
    });
  }

  // Containers (v1): cron is a Trigger sourceType now, invoked over HTTP -
  // there's no equivalent of the old Cron.args (an arbitrary invocation
  // payload for the Function runtime), so the same `schedule.input` value
  // is JSON-encoded into cronConfig.body, sent as the HTTP request body on
  // each invocation. cronConfig.timezone is required by the SDK but has no
  // serverless.yml config surface, so it defaults to UTC; destinationConfig
  // (path/method) is left unset, matching the container's own default
  // endpoint/method the way the old Cron had no path/method configurability
  // either. Neither of these defaults has been confirmed against the live
  // API from this environment.
  //
  // No sourceType field on the create request itself (the real
  // CreateTriggerRequest has none - the API infers it from which of
  // cronConfig/sqsConfig/natsConfig is set); sourceType only appears on the
  // *response*, read back in listTriggersForApplication above.
  return this.sdkApi.createTrigger({
    containerId: applicationId,
    name: params.name,
    cronConfig: {
      schedule: params.schedule,
      timezone: "UTC",
      body: JSON.stringify(params.args || {}),
      headers: {},
    },
  });
}

// Names the MnQ (Messaging & Queuing) credential minted for a given
// container message trigger - deterministic so deleteMessageTrigger can
// find it again by listing rather than needing any new stored state (same
// approach as deploy/lib/createRegistryNamespace.ts's registry namespace
// naming).
function mnqCredentialName(
  applicationId: string,
  triggerName: unknown,
): string {
  return `${applicationId}-${triggerName}`;
}

export async function createMessageTrigger(
  this: TriggerSdkContext,
  applicationId: string,
  isFunction: boolean,
  params: TriggerParams,
): Promise<Trigger> {
  if (isFunction) {
    // Functions stay on Functionv1beta1 - Scaleway-managed MNQ SQS/NATS
    // config, no credentials of this plugin's own making.
    const request: Record<string, unknown> = {
      functionId: applicationId,
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

  // Containers (v1): sqs/natsConfig need real, bring-your-own credentials -
  // Scaleway-managed scw_nats_config/scw_sqs_config no longer exist as a
  // request shape. A fresh credential is minted here rather than reused,
  // since Scaleway only ever reveals the secret material once, at creation
  // time (SqsCredentials.secretKey/NatsCredentials.credentials are
  // documented as "Only returned by the Create ... call") - the paired
  // credential is deleted in deleteMessageTrigger below when this trigger
  // is torn down for redeployment.
  const request: Record<string, unknown> = {
    containerId: applicationId,
    name: params.name,
  };
  const credentialName = mnqCredentialName(applicationId, params.name);

  if (params.scw_nats_config) {
    const nats = params.scw_nats_config as Record<string, unknown>;
    const natsAccountId = nats.mnq_nats_account_id as string;
    const mnqApi = mnqApiForRegion(
      this.provider,
      nats.mnq_region as string | undefined,
    );
    // Independent calls, safe to run concurrently - unlike the sqs branch
    // below, neither depends on the other having completed first.
    const [serverUrl, credentials] = await Promise.all([
      mnqApi.getNatsAccountEndpoint(natsAccountId),
      mnqApi.createNatsCredentials(natsAccountId, credentialName),
    ]);
    request.natsConfig = {
      serverUrls: [serverUrl],
      subject: nats.subject,
      credentialsFileContent: credentials.credentials?.content,
    };
  }

  if (params.scw_sqs_config) {
    const sqs = params.scw_sqs_config as Record<string, unknown>;
    const projectId =
      (sqs.mnq_project_id as string | undefined) ||
      this.provider.getScwProject()!;
    const mnqApi = mnqApiForRegion(
      this.provider,
      sqs.mnq_region as string | undefined,
    );
    // Sequenced, not parallelized: Queues must be activated for the
    // project before credentials can be created against it (see
    // ensureSqsActivated's own comment in mnq.ts) - a brand-new project's
    // very first sqs trigger would otherwise race createSqsCredentials
    // against the activation call.
    const endpoint = await mnqApi.ensureSqsActivated(projectId);
    const credentials = await mnqApi.createSqsCredentials(
      projectId,
      credentialName,
    );
    request.sqsConfig = {
      region: sqs.mnq_region,
      endpoint,
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
      queueUrl: `${endpoint}/${sqs.queue}`,
    };
  }

  return this.sdkApi.createTrigger(request);
}

// Unused for Containers today (nothing in deploy/lib/deployTriggers.ts
// calls this - every deploy deletes and recreates triggers rather than
// updating them in place), so it's kept targeting only Functions'
// v1beta1 shape rather than growing an unexercised Containers branch.
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
  isFunction: boolean,
): Promise<Trigger> {
  if (isFunction) {
    return this.sdkApi.deleteCron({ cronId: triggerId });
  }
  // Containers (v1): cron is just a Trigger, deleted the same way as any
  // other trigger.
  return this.sdkApi.deleteTrigger({ triggerId });
}

export async function deleteMessageTrigger(
  this: TriggerSdkContext,
  trigger: Trigger,
  isFunction: boolean,
): Promise<Trigger> {
  if (
    !isFunction &&
    (trigger.sourceType === "sqs" || trigger.sourceType === "nats")
  ) {
    const credentialName = mnqCredentialName(
      trigger.containerId as string,
      trigger.name,
    );
    // Only the deploying project is known for certain here - if a trigger
    // was created with an explicit scw_sqs_config.projectId/mnq_project_id
    // override (documented in docs/events.md), the credential lives in
    // that other project instead, and the returned Trigger/TriggerSQSConfig
    // carries no project id to recover it from. Best-effort: try the
    // deploying project (the common case, no override), which is a no-op
    // (not an error) if nothing matches there.
    const projectId = this.provider.getScwProject()!;
    if (trigger.sourceType === "sqs") {
      // TriggerSQSConfig.region *is* returned on the trigger, so the
      // credential's actual region can be recovered exactly here, unlike
      // the project id above.
      const region = (trigger.sqsConfig as { region?: string } | undefined)
        ?.region;
      const mnqApi = mnqApiForRegion(this.provider, region);
      await mnqApi.deleteSqsCredentialsByName(projectId, credentialName);
    } else {
      // TriggerNATSConfig carries neither a project id nor a region, so
      // this always falls back to the deploying region - a nats trigger
      // created with a different mnq_region will have its credential
      // looked up in the wrong region and silently left undeleted.
      const mnqApi = mnqApiForRegion(this.provider, undefined);
      await mnqApi.deleteNatsCredentialsByName(projectId, credentialName);
    }
  }
  return this.sdkApi.deleteTrigger({ triggerId: trigger.id });
}
