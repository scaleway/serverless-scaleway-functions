import ScalewayProvider from "../../provider/scalewayProvider";

interface ApplicationRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Trigger {
  id: string;
  schedule?: string;
  [key: string]: unknown;
}

interface ApplicationWithTriggers extends ApplicationRecord {
  currentTriggers: Trigger[];
}

interface ScheduleEvent {
  schedule: { rate: string; input?: Record<string, unknown> };
}
interface NatsEvent {
  nats: { name: string; scw_nats_config: Record<string, unknown> };
}
interface SqsEvent {
  sqs: { name: string; queue: string; projectId?: string; region?: string };
}
type TriggerEvent = ScheduleEvent | NatsEvent | SqsEvent;

interface DeployTriggersContext {
  serverless: { cli: { log(message: string): void } };
  provider: ScalewayProvider;
  functions: ApplicationRecord[];
  containers: ApplicationRecord[];
  listTriggersForApplication(
    applicationId: string,
    isFunction: boolean,
  ): Promise<Trigger[]>;
  deleteCronTrigger(triggerId: string): Promise<unknown>;
  deleteMessageTrigger(triggerId: string): Promise<unknown>;
  createCronTrigger(
    applicationId: string,
    isFunction: boolean,
    params: Record<string, unknown>,
  ): Promise<Trigger>;
  createMessageTrigger(
    applicationId: string,
    isFunction: boolean,
    params: Record<string, unknown>,
  ): Promise<Trigger>;
  manageTriggers(
    applications: ApplicationRecord[] | undefined,
    isFunction: boolean,
  ): Promise<unknown[]> | undefined;
  getTriggersForApplication(
    application: ApplicationRecord,
    isFunction: boolean,
  ): Promise<ApplicationWithTriggers>;
  deletePreviousTriggersForApplication(
    application: ApplicationWithTriggers,
  ): Promise<unknown[]>;
  createNewTriggersForApplication(
    application: ApplicationRecord,
    isFunction: boolean,
  ): Promise<(Trigger | undefined)[]>;
  printDeployedTriggersForApplication(
    application: ApplicationRecord,
    triggers: (Trigger | undefined)[],
  ): undefined;
}

export async function deployTriggers(
  this: DeployTriggersContext,
): Promise<unknown[] | undefined> {
  this.serverless.cli.log("Deploying triggers...");
  await this.manageTriggers(this.functions, true);
  return this.manageTriggers(this.containers, false);
}

export function manageTriggers(
  this: DeployTriggersContext,
  applications: ApplicationRecord[] | undefined,
  isFunction: boolean,
): Promise<unknown[]> | undefined {
  if (!applications || !applications.length) {
    return undefined;
  }

  // For each Functions
  const promises = applications.map((application) =>
    this.getTriggersForApplication(application, isFunction)
      .then((appWithTriggers) =>
        this.deletePreviousTriggersForApplication(appWithTriggers),
      )
      .then(() => this.createNewTriggersForApplication(application, isFunction))
      .then((triggers) =>
        this.printDeployedTriggersForApplication(application, triggers),
      ),
  );

  return Promise.all(promises);
}

export function getTriggersForApplication(
  this: DeployTriggersContext,
  application: ApplicationRecord,
  isFunction: boolean,
): Promise<ApplicationWithTriggers> {
  return this.listTriggersForApplication(application.id, isFunction).then(
    (triggers) => ({
      ...application,
      currentTriggers: [...triggers],
    }),
  );
}

export function deletePreviousTriggersForApplication(
  this: DeployTriggersContext,
  application: ApplicationWithTriggers,
): Promise<unknown[]> {
  // Delete and re-create every triggers...
  const deleteTriggersPromises = application.currentTriggers.map((trigger) => {
    if ("schedule" in trigger) {
      return this.deleteCronTrigger(trigger.id);
    }
    return this.deleteMessageTrigger(trigger.id);
  });

  return Promise.all(deleteTriggersPromises);
}

export function createNewTriggersForApplication(
  this: DeployTriggersContext,
  application: ApplicationRecord,
  isFunction: boolean,
): Promise<(Trigger | undefined)[]> {
  // Get application for serverless service, to get events
  let serverlessApp;
  if (isFunction) {
    serverlessApp =
      this.provider.serverless.service.functions![application.name];
  } else {
    serverlessApp =
      this.provider.serverless.service.custom!.containers![application.name];
  }

  if (!serverlessApp || !serverlessApp.events) {
    return Promise.resolve([]);
  }

  const createTriggersPromises = (
    serverlessApp.events as unknown as TriggerEvent[]
  ).map((event) => {
    if ("schedule" in event) {
      return this.createCronTrigger(application.id, isFunction, {
        schedule: event.schedule.rate,
        args: event.schedule.input || {},
      });
    }
    if ("nats" in event) {
      return this.createMessageTrigger(application.id, isFunction, {
        name: event.nats.name,
        scw_nats_config: event.nats.scw_nats_config,
      });
    }
    if ("sqs" in event) {
      return this.createMessageTrigger(application.id, isFunction, {
        name: event.sqs.name,
        scw_sqs_config: {
          queue: event.sqs.queue,
          mnq_project_id: event.sqs.projectId || this.provider.getScwProject(),
          mnq_region: event.sqs.region || this.provider.getScwRegion(),
        },
      });
    }
    return undefined;
  });

  return Promise.all(createTriggersPromises);
}

export function printDeployedTriggersForApplication(
  this: DeployTriggersContext,
  application: ApplicationRecord,
  triggers: (Trigger | undefined)[],
): undefined {
  triggers.forEach(() =>
    this.serverless.cli.log(
      `Deployed a new trigger for application ${application.name}`,
    ),
  );
  return undefined;
}
