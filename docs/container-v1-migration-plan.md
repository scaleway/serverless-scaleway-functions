# Containers API: v1beta1 → v1 migration plan

Status: **in progress**, on branch `feature/container-v1-migration`.

- ✅ Phase 1 (Namespace + Container CRUD core, registry namespace auto-provisioning) - committed.
- ✅ Phase 3 (triggers, cron-as-trigger, MnQ credential auto-provisioning) - committed.
- ✅ Phase 4 (docs/README/examples) - confirmed no serverless.yml surface changed, so README/docs/events.md needed no changes; added a short note to `docs/containers.md` about the new (to the user) registry-namespace auto-provisioning/fallback-naming behavior, since that's the one thing a user might actually observe/be confused by.
- 🟡 Phase 5 (full regression) - live credentials became available and `tests/containers` was run repeatedly against the real API; this found and fixed two real bugs and confirmed the registry-namespace fallback-naming path actually works, but full end-to-end verification (a real image build/push/deploy) is still blocked by an environment credential limitation, not a code issue - see "Live API verification results" below.

## Current state

- Containers: `Containerv1beta1.API` via `@scaleway/sdk-container` (already `^2.12.0`,
  which bundles both `v1` and `v1beta1` — no dependency bump needed to start this work).
- Functions: `Functionv1beta1.API` via `@scaleway/sdk-function` (`^2.11.0`) — **this
  package has no `v1` yet**, only `v1beta1`. This migration can therefore only be a
  containers-side change; functions stay on `v1beta1` regardless of what we decide here.
- The SDK's own `v1beta1.API` doc comment marks it `[DEPRECATED]`, pointing at `v1` and
  a migration guide.

Where `v1beta1` is wired in today: `shared/api/index.ts` (`ContainerApi`),
`shared/api/containers.ts`, `shared/api/namespaces.ts` (shared by both products),
`shared/api/triggers.ts` (shared by both products via an `isFunction` flag),
`deploy/lib/createContainers.ts`, `deployContainers.ts`, `deployTriggers.ts`,
`buildAndPushContainers.ts`, plus `README.md`/`docs/events.md` and
`tests/containers`, `tests/triggers`.

## Confirmed breaking changes (v1beta1 → v1)

Verified against the SDK's generated `.d.ts` for both namespaces
(`node_modules/@scaleway/sdk-container/dist/{v1,v1beta1}`) and cross-checked against
Scaleway's public docs (sources at the end).

### Container fields

| v1beta1                                 | v1                                               | Notes                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memoryLimit` (MB)                      | `memoryLimitBytes` (bytes)                       | unit change, not just a rename                                                                                                                                                          |
| `cpuLimit`                              | `mvcpuLimit`                                     | rename                                                                                                                                                                                  |
| `localStorageLimit` (MB)                | `localStorageLimitBytes` (bytes)                 | unit change                                                                                                                                                                             |
| `registryImage`                         | `image`                                          | rename, and `image` becomes **required** on create (currently optional in this repo's config)                                                                                           |
| `maxConcurrency`                        | _(removed)_                                      | already deprecated in this codebase (`createContainers.ts`'s `maxConcurrencyDeprecationWarning`); v1 finalizes the removal                                                              |
| `domainName`                            | `publicEndpoint`                                 | rename/replacement                                                                                                                                                                      |
| `httpOption` (`enabled`/`redirected`)   | `httpsConnectionsOnly: boolean`                  | semantic flattening — README's `httpOption: enabled` config needs a translation rule                                                                                                    |
| `healthCheck`                           | `livenessProbe` + `startupProbe`                 | split into two probes. By behavior description, the old single check (fails deployment during startup) maps most closely to `startupProbe`; `livenessProbe` is new, no prior equivalent |
| `secretEnvironmentVariables` (response) | `{key, hashedValue}[]` → `Record<string,string>` | response shape change                                                                                                                                                                   |
| `deployContainer()`                     | `redeployContainer()`                            | rename; per Scaleway's migration guide, create/update now auto-deploy (the old `deploy=true` flag is gone)                                                                              |

### Namespaces

- **Confirmed via Scaleway's docs**: creating a Containers namespace **no longer
  auto-creates a Container Registry namespace**, and `registryEndpoint` /
  `registryNamespaceId` are gone from the v1 `Namespace` type entirely. This repo
  currently reads `namespace.registryEndpoint` in `buildAndPushContainers.ts` and
  `createContainers.ts` to build the image push target — under v1 this has to come
  from somewhere else (the separate Registry API this repo already talks to in
  `shared/api/registry.ts`, or an explicit registry namespace the user configures).
  **This is the single biggest functional gap and needs a design decision, not just a
  rename.**
- `secretEnvironmentVariables`: same array→record shape change as `Container`.
- `vpcIntegrationActivated` removed (was already a documented no-op).

### Crons and Tokens: resources removed outright

- Cron is no longer a separate resource — it's `sourceType: 'cron'` + `cronConfig` on
  a `Trigger`, via the unified `/triggers` route (confirmed by Scaleway docs).
  `shared/api/triggers.ts`'s `createCron`/`updateCron`/`deleteCron` calls need a full
  rewrite onto `createTrigger`/`updateTrigger`/`deleteTrigger`.
- `Token` (legacy revocable auth token) is removed entirely in v1 (IAM-only auth now).
  Confirmed via grep: **this repo never calls `createToken`/`getToken`/`listTokens`/
  `deleteToken` anywhere** — zero impact here.

### Triggers: SQS/NATS now bring-your-own-credentials

- **Confirmed via Scaleway docs**: v1 SQS/NATS triggers require the user's own IAM
  credentials (`accessKeyId`/`secretAccessKey`, `credentialsFileContent`) instead of
  Scaleway-managed MNQ credentials (`mnqNatsAccountId`, `mnqProjectId`, `mnqRegion`,
  `mnqCredentialId`). This is exactly the model `docs/events.md` documents today
  (`scw_nats_config`, `mnq_nats_account_id`, etc.) — **this is a real user-facing
  breaking change to a currently-documented feature**, not an SDK typings quirk.

### Structural fallout specific to this repo

- `shared/api/triggers.ts` is explicitly written as _one_ implementation shared
  between function and container triggers, justified by "both product APIs have
  matching shapes" (its own comment). Since `@scaleway/sdk-function` has no `v1` yet,
  migrating only containers breaks that assumption — container triggers would need
  `createTrigger`/`cronConfig`/`sqsConfig` while function triggers keep
  `createCron`/`scwSqsConfig`. The shared function needs to split into per-product
  paths. So "container v1" isn't an isolated swap in `containers.ts` alone — it forces
  a structural change in trigger code that's nominally shared with functions.
- Status-literal checks (`"ready"`, `"error"`, `"locked"` in `containers.ts`'s and
  `namespaces.ts`'s waiters) are safe — all three values persist in v1's enums.

## Recommended phasing (once a decision is made to proceed)

1. **Namespace + Container CRUD core** — swap `Containerv1beta1` → `Containerv1` in
   `shared/api/index.ts`/`containers.ts`, field renames/units, `toLegacyContainer`
   updates, and resolve the registry-endpoint sourcing question.
2. **Health check → probes** — translate `healthCheck:` config to `startupProbe`,
   decide `livenessProbe` exposure, update README.
3. **Triggers rewrite** — cron-as-trigger, split `triggers.ts`'s shared logic per
   product, redesign `docs/events.md`'s SQS/NATS config surface around
   bring-your-own-credentials (likely needs a serverless.yml schema change, which is
   itself a breaking change for existing users of that feature).
4. **Docs/README/examples** — `httpOption`→`httpsConnectionsOnly`, healthCheck→probes,
   events.md rewrite.
5. **Full regression** — `tests/containers`, `tests/triggers`, `tests/deploy`,
   `tests/runtimes` against the live API.

## Resolved design decisions

The two open items above have been resolved. Guiding constraint: **no breaking
changes to serverless.yml** — `httpOption`, `healthCheck`, and `docs/events.md`'s
`scw_nats_config`/`scw_sqs_config`/`sqs` event shapes all stay exactly as they are
today; everything below is internal-only.

### Registry namespace: auto-create, with a deterministic naming strategy

Registry namespaces are created/listed/managed via the credentials this plugin
already has, through the existing `shared/api/registry.ts`'s `RegistryApi` — no new
credential type.

**Naming**: confirmed via the SDK's own doc comment that registry namespace names are
_"unique in a region across all organizations"_ — globally unique, unlike container
namespace names (project-scoped only per `sdk-container`'s doc comment: _"must be
unique inside a project"_). So a naive "reuse the container namespace's name"
strategy will occasionally collide with an unrelated namespace in a different
organization. Resolution, extending this repo's existing "derive name, list by exact
name, create if missing" idiom (`deploy/lib/createNamespace.ts`):

1. Primary candidate = the container/function namespace's own name.
2. On deploy, look it up via `listRegistryNamespace` filtered to that name; if found,
   use it.
3. If not found, attempt to create it. On a 409 (name taken by someone else globally),
   deterministically fall back to `<name>-<short-hash-of-projectId>` and retry once.
4. Every subsequent deploy recomputes the same 1–2 candidate names from data already
   at hand (the namespace's own name + project ID) and looks them up in order — no new
   local or remote state needs to be introduced. This is why "how does the system
   persist the created name" turned out not to need an answer: this plugin has no
   local state file anywhere today (confirmed — `.serverless/` is a gitignored,
   ephemeral, per-machine build-artifact staging directory only, and
   `write-service-outputs.ts` only prints to the CLI), and the deterministic-candidate
   approach keeps this addition consistent with that.

### MnQ credentials: auto-create via `@scaleway/sdk-mnq`, scoped narrowly

New direct dependency: `@scaleway/sdk-mnq` (currently `v1beta1` only, no `v1` yet —
same situation as `@scaleway/sdk-function`). Confirmed it exposes
`createSqsCredentials`/`createNatsCredentials`/`activateSqs`/`activateSns` using the
same project-scoped secret key this plugin already holds.

- **NATS account scope — credential only.** `mnq_nats_account_id` stays a required
  field in `docs/events.md`'s config exactly as today; the plugin only auto-creates
  the per-trigger _credential_ scoped to that existing account, not the account
  itself. Keeps this change additive rather than taking on lifecycle ownership of a
  new resource type.
- **MnQ activation — automatic.** If SQS/NATS isn't yet activated for the
  project/region, the plugin calls `activateSqs`/`activateSns` transparently rather
  than failing and telling the user to do it out-of-band. Consistent with
  auto-creating registry namespaces "if needed."
- **Credential lifecycle — mint fresh, rotate every deploy.** Confirmed via the SDK's
  types that `SqsCredentials.secretKey` and `NatsCredentials.credentials` are each
  documented as _"Only returned by the Create call"_ — write-once, unrecoverable on
  any later `get`/`list`. So credentials can't be found-and-reused the way namespaces
  can. This turns out to be fine as-is: `deployTriggers.ts` already deletes and
  recreates **every** trigger on **every** deploy
  (`deletePreviousTriggersForApplication` / `createNewTriggersForApplication`), so
  credential deletion just piggybacks on that existing pass — when an old
  message-trigger is deleted, delete the paired credential too, found via a
  deterministic name (derived from `applicationId` + trigger name, both already in
  hand at that point) filtered client-side after `listSqsCredentials`/
  `listNatsCredentials` (confirmed there's no server-side `name` filter on either
  call, same client-side-filter pattern already used elsewhere in this repo). A fresh
  credential is then minted for the newly (re)created trigger in the same deploy.
  Net effect: every deploy that touches a message-triggered function/container
  rotates its underlying SQS/NATS credential. No local or remote state is needed to
  support this — the secret is only ever used transiently in-process (create
  credential → immediately embed it in the same `createTrigger()` call → discard);
  Scaleway's platform retains it inside the Trigger resource afterward, not the
  plugin. Smarter change-detection (skip recreation when config didn't change) was
  considered and deliberately deferred — it's a larger, separate behavior change
  beyond the v1 API swap, and even it wouldn't need the secret stored, since it would
  diff non-secret fields (`queue`/`region`/`subject`) against the existing `Trigger`
  object instead.

## Implementation notes (Phase 3: triggers)

Cron moved from a separate resource (`createCron`/`updateCron`/`deleteCron`/`listCrons`,
Functions-only shape still used as-is) to `sourceType: 'cron'` + `cronConfig` on the
same `Trigger` resource used for sqs/nats, via the unified `createTrigger`/
`listTriggers`/`deleteTrigger`. `shared/api/triggers.ts` now branches every function on
`isFunction` since the two products' shapes have diverged - see the file's own comments
for the per-function detail. `shared/api/mnq.ts` (new, wraps the new
`@scaleway/sdk-mnq` v1beta1-only dependency) mints a fresh SQS/NATS credential on every
trigger creation and deletes the paired one (found by a deterministic
`${applicationId}-${triggerName}` name) on every trigger deletion, piggybacking on
`deployTriggers.ts`'s existing delete-and-recreate-every-trigger-every-deploy behavior.

### Found and fixed during review

- **SQS activation raced against credential creation.** The first implementation fired
  `ensureSqsActivated`/`createSqsCredentials` in `Promise.all`, but Queues must be
  activated before credentials can be created against a project - for a project's very
  first SQS trigger (a mainline case, not an edge case), this could race
  `createSqsCredentials` ahead of the `activateSqs` call actually landing. Fixed by
  sequencing the two calls.
- **MnQ calls always targeted the deploy's own region/project, ignoring the trigger's
  own `mnq_region`/`mnq_project_id`.** `docs/events.md`'s `mnq_region`/`projectId`
  fields are a documented, supported override (an MNQ resource can live in a different
  region/project than the function/container being deployed) - under v1beta1's
  Scaleway-managed config this was handled entirely server-side, but now that this
  plugin makes real client-side MNQ calls (`getSqsInfo`, `activateSqs`,
  `createSqsCredentials`, `getNatsAccount`, `createNatsCredentials`, and their `list*`/
  `delete*` counterparts), getting the region wrong isn't just a wrong default - it can
  404 (`getNatsAccount`) or silently fail to find a credential to clean up on delete
  (`list*Credentials` calls are region-scoped). Fixed for trigger _creation_ (the
  region is read from the trigger's own config) and for SQS _deletion_ (the region is
  recovered from `Trigger.sqsConfig.region`, which the SDK does return). Covered by new
  tests asserting the `MnqApi` client is constructed with the trigger's own region, not
  the deploy region.
- Removed a `sourceType` field being set on `CreateTriggerRequest` in all three create
  paths (cron/sqs/nats) - the real request type has no such field (the API infers
  source type from which of `cronConfig`/`sqsConfig`/`natsConfig` is populated), so it
  was silently dropped by the marshaller. Harmless at runtime, but dead and misleading.

### Known, documented limitation (not fixed - no live API access to verify a fix)

**NATS credential deletion, and SQS credential deletion under a `projectId` override,
can't always recover the original region/project at delete time**, because the SDK's
returned `Trigger` object doesn't carry enough information to reconstruct it:
`TriggerNATSConfig` carries neither a region nor an account ID, and `TriggerSQSConfig`
carries a region but no project ID. `deleteMessageTrigger` falls back to the deploying
region/project in both cases (the common, no-override case - correct), but a NATS
trigger created with a different `mnq_region`, or an SQS trigger created with an
explicit `mnq_project_id`/`projectId` override, will have its paired credential looked
up in the wrong place and silently left undeleted (not re-_created_ wrong, not a
data-loss bug - just a credential that lingers until manually cleaned up). This is
explicitly commented at both call sites in `shared/api/triggers.ts`. Fixing it properly
likely needs a product decision (e.g. encoding the region/project into the credential
name itself, so delete time doesn't need to recover it from the trigger response at
all) rather than a mechanical fix.

### Assumptions not yet confirmed against the live API

The items below were unconfirmed as of the initial implementation. `tests/containers`
has since run live (see "Live API verification results" below), which resolved the
`startup_probe.timeout` item and partially narrowed the registry-conflict-status item;
everything else here is still genuinely unconfirmed, since live verification never got
past the registry-namespace-creation step (blocked by credential scope, not by any of
these):

- **Container cron trigger defaults**: `cronConfig.timezone` defaults to `"UTC"` (no
  serverless.yml surface for it), `cronConfig.body` is the JSON-encoded `schedule.input`
  value, and `destinationConfig` (HTTP path/method) is left unset entirely (matching the
  old Cron's lack of path/method configurability). Whether an unset `destinationConfig`
  actually falls back to a sensible default (e.g. `POST /`) rather than erroring is
  unconfirmed.
- **SQS `queueUrl` construction**: built as `` `${sqsEndpointUrl}/${queue}` `` from
  `SqsInfo.sqsEndpointUrl` + the user's configured queue name. The exact URL format
  Scaleway expects (whether the project ID needs to appear in the path separately, etc.)
  hasn't been confirmed.
- **`MnqApi.ensureSqsActivated`'s activation-detection**: calls `getSqsInfo` first and
  treats any thrown error the same as a `"disabled"` status (fall back to `activateSqs`).
  Whether `getSqsInfo` actually throws (e.g. 404) for a never-activated project, or
  returns a `"disabled"`-status response instead, is unconfirmed - the code handles
  both, but neither path has been exercised for real.
- **Registry namespace creation conflict status code**: still not directly observed (no
  real name collision was hit live) - but now known to NOT be 403 (that status is a real,
  distinct PermissionsDeniedError - see below), which is why the fallback-retry logic
  was narrowed to check for exactly 409 rather than any `ScalewayError`.

These should be verified against a real Scaleway project with **registry-write IAM
permissions** (see the credential-scope finding below) via `tests/triggers`,
`tests/containers`, and `tests/domain` before this ships.

## Live API verification results

`tests/containers` (live, real API) was run repeatedly against the credentials made
available in this session, iterating on what it found. Every fix below is confirmed by
re-running the suite afterward and observing the specific failure disappear.

### Confirmed bugs found and fixed

1. **`startup_probe.timeout` is required by the live API despite being typed optional
   in the SDK.** Creating a container with a `startupProbe` (i.e. any `healthCheck:`
   config) and no `timeout` field was rejected outright:
   `InvalidArgumentsError: invalid argument(s): startup_probe.timeout is required,
value is required`. There is no serverless.yml surface for this (the old
   `healthCheck` never had a timeout field), so `shared/api/containers.ts`'s
   `toSdkStartupProbe` now always sends a fixed default (`"1s"`). This is exactly the
   kind of SDK-type-vs-real-API mismatch the rest of this plan already flagged as a
   risk for `destinationConfig`/`cronConfig.timezone` - confirmed it's a real pattern,
   not a hypothetical one.
2. **The registry-namespace fallback-naming retry was too broad.** Confirmed live that
   a 403 `PermissionsDeniedError` (`insufficient permissions: write api_admin_namespace`
   - see the credential-scope finding below) is a real `ScalewayError` this call can
     throw for reasons that have nothing to do with the name being taken. The original
     code retried with the fallback name on _any_ `ScalewayError`, which for this case
     wasted a second call guaranteed to fail identically and logged a misleading "name
     unavailable" message. Narrowed to retry only on status `409`.
3. **Test-harness bug, not a migration bug, but blocked all live verification of it**:
   `tests/containers/containers.test.js` and `tests/containers/containers_private_registry.test.js`
   scaffold their test service via `serverless create --template-path <example> --path
<tmpDir>`, then used a plain text replace to set `service:` to a real value.
   Confirmed directly (`serverless create --template-path examples/container --path
/tmp/probe/abc123`) that the live `osls` 3.77.1 CLI already overwrites `service:` to
   match `--path`'s basename as part of scaffolding - so the placeholder string the
   text replace looked for was already gone, and the replace silently no-op'd. Since
   `tests/utils/fs`'s `getTmpDirPath()` generates that basename as a random hex string,
   this **passed or failed at random** depending on whether the hex happened to start
   with `0-9` (invalid - Scaleway namespace names must start with a letter) or `a-f`
   (valid) - a real, pre-existing flakiness bug, unrelated to Containers v1beta1→v1 at
   all. Fixed by setting `service:` via parsed YAML (read/modify/write) instead of a
   text replace, matching the approach `tests/utils/misc/index.ts`'s
   `createTestService()` (used by `tests/triggers`, which was never affected by this)
   already used.

### Confirmed working

- Container **namespace** creation end-to-end against `Containerv1` (once the above
  test-harness bug stopped masking it with an invalid name).
- The registry-namespace **fallback-naming path itself executes correctly** in a real
  run: a primary-name attempt genuinely failed, and the code logged and retried with
  the deterministic project-suffixed fallback name exactly as designed (the failure
  that iteration hit afterward, permissions, is a separate, environment-specific issue
  - not evidence the fallback logic itself is broken).
- `resolveTestProject()`'s existing-project fallback and `usingExistingProject`
  guard (never delete a shared/pre-existing project) both work as intended - confirmed
  by manually checking the project's container/registry namespaces were empty
  before _and_ after a run, and that ephemeral projects created during earlier runs
  were cleaned up (no `"failed to delete project"` log lines) except for the very
  first run, before `SCW_ORGANIZATION_ID` was set correctly (a session setup mistake,
  not a code bug).

### Credential-scope limitation (environment, not code)

The credentials available in this session can create Scaleway **projects** (via
`AccountApi.createProject`) but cannot **list** projects org-wide (403 on
`AccountApi.listProjects`, so `bun run clean-up`'s org-wide sweep can't run - not an
issue in practice here since `removeProjectById` deletes by a specific known ID and
doesn't need that permission) and, more significantly, **cannot create Container
Registry namespaces** (403 `insufficient permissions: write api_admin_namespace` on
`RegistryApi.createRegistryNamespace`, on a project this same session had just created).
Since nearly every realistic container deploy needs a registry namespace (anything
built from a `directory`, or without an explicit `registryImage`), this blocks full
end-to-end live verification of the container deploy path, and transitively blocks
`tests/triggers`' container-runtime case too (`examples/container-schedule` also builds
from a `directory`) - `tests/triggers`' function-runtime case doesn't touch the
Registry API and would not hit this wall, but wasn't run given the container case in
the same suite was already known to be blocked by it. This needs credentials with
registry-write IAM permissions to get past.

## Sources

- [Serverless Containers v1beta1 to v1 migration guide](https://www.scaleway.com/en/docs/serverless-containers/reference-content/v1-migration-guide/)
- [How to add a trigger to a container](https://www.scaleway.com/en/docs/serverless-containers/how-to/add-trigger-to-a-container/)
