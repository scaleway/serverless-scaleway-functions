import type { Mnqv1beta1 } from "@scaleway/sdk-mnq";
import sdkClient = require("./sdkClient");
const { createScalewayClientFromResourceUrl, createLazySdkApi } = sdkClient;
import MnqSdk = require("@scaleway/sdk-mnq");
const { Mnqv1beta1: Mnq } = MnqSdk;

interface SqsCredentialsRecord {
  id: string;
  accessKey: string;
  secretKey: string;
}

interface NatsCredentialsRecord {
  id: string;
  credentials?: { name: string; content: string };
}

// @scaleway/sdk-mnq only has a v1beta1 (no v1 yet, same situation as
// @scaleway/sdk-function) - it splits Queues (SQS), NATS, and Topics and
// Events (SNS) into three separate API classes rather than one, unlike
// sdk-container/sdk-registry's single API class per version. Only
// Sqs/NatsAPI are needed here (Container v1 triggers only support sqs and
// nats source types, not SNS).
class MnqApi {
  sqsApi: Mnqv1beta1.SqsAPI;
  natsApi: Mnqv1beta1.NatsAPI;

  constructor(mnqApiUrl: string, token: string) {
    // Lazy plain-value Proxy - see the long comment on createLazySdkApi in
    // sdkClient.ts (same reasoning as every other API class in this repo:
    // this class isn't currently mixed onto a plugin via Object.assign, but
    // keeping the pattern consistent avoids the exact bug that comment
    // documents if that ever changes).
    this.sqsApi = createLazySdkApi(
      () =>
        new Mnq.SqsAPI(createScalewayClientFromResourceUrl(mnqApiUrl, token)),
    );
    this.natsApi = createLazySdkApi(
      () =>
        new Mnq.NatsAPI(createScalewayClientFromResourceUrl(mnqApiUrl, token)),
    );
  }

  // Queues (SQS) must be "activated" for a project before credentials can
  // be created - activation is documented as free and always safe to call
  // ("Activating Queues does not trigger any billing, and you can
  // deactivate at any time"), but whether getSqsInfo throws or returns a
  // "disabled" status for a never-activated project hasn't been confirmed
  // against the live API from this environment, so both are handled here.
  async ensureSqsActivated(projectId: string): Promise<string> {
    try {
      const info = await this.sqsApi.getSqsInfo({ projectId });
      if (info.status === "enabled") {
        return info.sqsEndpointUrl;
      }
    } catch {
      // Not yet activated (or info genuinely unavailable) - fall through
      // to activation below.
    }
    const activated = await this.sqsApi.activateSqs({ projectId });
    return activated.sqsEndpointUrl;
  }

  async createSqsCredentials(
    projectId: string,
    name: string,
  ): Promise<SqsCredentialsRecord> {
    return this.sqsApi.createSqsCredentials({
      projectId,
      name,
      permissions: { canPublish: true, canReceive: true, canManage: false },
    });
  }

  async deleteSqsCredentialsByName(
    projectId: string,
    name: string,
  ): Promise<void> {
    const credentials = await this.sqsApi
      .listSqsCredentials({ projectId })
      .all();
    const match = credentials.find((c) => c.name === name);
    if (match) {
      await this.sqsApi.deleteSqsCredentials({ sqsCredentialsId: match.id });
    }
  }

  async getNatsAccountEndpoint(natsAccountId: string): Promise<string> {
    const account = await this.natsApi.getNatsAccount({ natsAccountId });
    return account.endpoint;
  }

  async createNatsCredentials(
    natsAccountId: string,
    name: string,
  ): Promise<NatsCredentialsRecord> {
    return this.natsApi.createNatsCredentials({ natsAccountId, name });
  }

  // Filters by projectId rather than natsAccountId: at delete time (see
  // triggers.ts's deleteMessageTrigger) only the trigger's name and this
  // deploy's own project ID are in hand - the original natsAccountId used
  // to create the credential isn't retained anywhere. listNatsCredentials
  // accepts either filter, so projectId (always known) is used instead.
  async deleteNatsCredentialsByName(
    projectId: string,
    name: string,
  ): Promise<void> {
    const credentials = await this.natsApi
      .listNatsCredentials({ projectId })
      .all();
    const match = credentials.find((c) => c.name === name);
    if (match) {
      await this.natsApi.deleteNatsCredentials({
        natsCredentialsId: match.id,
      });
    }
  }
}

export = MnqApi;
