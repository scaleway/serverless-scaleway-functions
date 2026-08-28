# Code review findings & fixing plan

Review date: 2026-08-26. Scope: `provider/`, `deploy/`, `remove/`, `invoke/`, `jwt/`, `logs/`, `info/`, `shared/`, `index.js` (all `.js`, excluding `tests/` and `examples/`). Every finding below was confirmed by reading the actual code directly (not inferred); line numbers refer to the current `master` (`c1e902d`) **as of the review date** — the subsequent TypeScript + `@scaleway/sdk-*` rewrite (`v2llm` branch, 2026-08-26/27) renamed and restructured most of these files, so line numbers below are historical, not navigable against current code.

This was a findings + plan document only when written — no code had been changed yet at review time. **Status update, 2026-08-27:** the TS/SDK rewrite resolved the large majority of these findings as a side effect of rewriting the underlying implementation, not because anyone worked this specific plan item-by-item — each row below was individually re-verified against current code. Two items are not fully resolved (#14, #21); see their notes. Re-verify against current code before trusting any status below if more time has passed since 2026-08-27 — this table isn't kept live.

## Summary

| #   | Severity | Area          | One-liner                                                                                                    | Status (2026-08-27)                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Critical | API client    | TLS certificate verification is disabled for every API call                                                  | **Resolved.** No `rejectUnauthorized` anywhere in `shared/`/`provider`/`deploy` — the axios client it lived on is gone.                                                                                                                                                                                                                                                       |
| 2   | High     | API client    | `manageError` silently swallows some errors instead of throwing                                              | **Resolved.** `shared/api/utils.ts`'s `manageError` always throws (`CustomError` or plain `Error`), never swallows.                                                                                                                                                                                                                                                           |
| 3   | High     | Triggers      | Trigger delete/create calls aren't awaited — races that likely cause the still-open HTTP 409s                | **Resolved.** `deploy/lib/deployTriggers.ts` returns/`Promise.all`s throughout.                                                                                                                                                                                                                                                                                               |
| 4   | High     | API client    | List endpoints don't paginate — resources beyond page 1 are invisible                                        | **Resolved.** Every list call now uses the SDK's own `.all()` (`shared/api/namespaces.ts`, `functions.ts`, `containers.ts`, `registry.ts`).                                                                                                                                                                                                                                   |
| 5   | High     | Deploy        | Recent crash fix over-broadened silent failure to all 4xx, causing a _different_ crash downstream            | **Resolved.** `waitForFunctionStatus`/`waitForContainer` (`shared/api/functions.ts`, `containers.ts`) tolerate only `err.status === 404`, not all 4xx.                                                                                                                                                                                                                        |
| 6   | High     | JWT           | `serverless jwt` issues function JWTs for containers (copy/paste bug)                                        | **Resolved.** `shared/api/jwt.ts` has distinct `issueJwtFunction`/`issueJwtContainer`; `jwt/lib/getJwt.ts` dispatches on which is mixed in.                                                                                                                                                                                                                                   |
| 7   | High     | Provider      | Region from `~/.config/scw/config.yaml` (`default_region`) is silently discarded                             | **Resolved.** `provider/scalewayProvider.ts` reads `scwConfig.default_region`.                                                                                                                                                                                                                                                                                                |
| 8   | High     | Provider      | Partial `scwToken`/`scwProject` in `serverless.yml` crashes with an unhelpful `TypeError`                    | **Resolved.** Current credential-resolution branch handles either being set without crashing.                                                                                                                                                                                                                                                                                 |
| 9   | Medium   | Deploy        | `.then(cli.log(...))` bug — delete confirmation log fires before deletion is confirmed                       | **Resolved.** `deploy/lib/createFunctions.ts`'s log is wrapped in `.then(() => {...})` and properly awaited/returned.                                                                                                                                                                                                                                                         |
| 10  | Medium   | Deploy        | Domain-deployment wait isn't awaited — deploy can "succeed" before domains are ready                         | **Resolved.** `deploy/lib/deployFunctions.ts`/`deployContainers.ts` chain and return the domain wait.                                                                                                                                                                                                                                                                         |
| 11  | Medium   | Registry      | Registry namespace listing uses the wrong query param name, breaking project scoping                         | **Resolved.** `shared/api/registry.ts` uses the SDK's typed `listNamespaces({ projectId })` — no hand-rolled query string.                                                                                                                                                                                                                                                    |
| 12  | Medium   | Invoke        | `serverless invoke` has no auth header, isn't awaited, and crashes on an unmatched name                      | **Resolved.** `invoke/scalewayInvoke.ts` awaits throughout.                                                                                                                                                                                                                                                                                                                   |
| 13  | Medium   | Domains       | `createDomainAndLog` is fire-and-forget; domain failures never fail the deploy                               | **Resolved.** Calls are collected into `Promise.all([...])` and returned in `createFunctions.ts`/`createContainers.ts`. Note: `createDomainAndLog` itself still deliberately resolves (doesn't reject) on a domain failure after logging it — that's intentional per-domain error tolerance, not the original fire-and-forget bug; see `tests/shared/domain-and-log.test.js`. |
| 14  | Medium   | Containers    | `.dockerignore` contents are never applied — excluded files/secrets can end up in the image                  | **Still open.** Not touched by the TS/SDK rewrite (unrelated to API client code); needs its own dedicated look.                                                                                                                                                                                                                                                               |
| 15  | Medium   | Validation    | Nothing rejects defining both `functions` and `custom.containers` — confusing crash instead of a clear error | **Resolved.** `shared/validate.ts` now throws a clear error.                                                                                                                                                                                                                                                                                                                  |
| 16  | Low      | Cleanup logic | `getElementsToDelete` inner loop is dead code (wrong comparison + non-mutating `slice`)                      | **Resolved.** `shared/singleSource.ts`'s current version has no such dead branch.                                                                                                                                                                                                                                                                                             |
| 17  | Low      | Robustness    | All polling loops (`wait*`) are unbounded — no timeout/max attempts                                          | **Resolved.** Every `wait*` in `shared/api/*.ts` now has a `MAX_POLL_ATTEMPTS` bound.                                                                                                                                                                                                                                                                                         |
| 18  | Low      | Remove        | `waitNamespaceIsDeleted` discards the real error behind a generic message on any non-404 failure             | **Resolved.** Current version includes `err.message` in the thrown error.                                                                                                                                                                                                                                                                                                     |
| 19  | Low      | Info          | `serverless info` has no `.catch` on its API calls — unhandled rejection on failure                          | **Resolved in effect.** Still no local `.catch`, but the promise chain is now properly returned up to the Serverless Framework's own hook runner, which handles the rejection — no longer a true unhandled rejection.                                                                                                                                                         |
| 20  | Low      | Code quality  | Dead `if (inspectedImage === undefined) return;` in container build                                          | **Resolved.** Not present in current `deploy/lib/buildAndPushContainers.ts`.                                                                                                                                                                                                                                                                                                  |
| 21  | Low      | Code quality  | Function/container create-update paths are ~80 lines of duplicated, drifting logic                           | **Partially true.** `createFunctions.ts`/`createContainers.ts` are now 378/391 lines (mostly TS interface boilerplate, not duplicated logic), and the specific drift this finding called out is gone — but the general "two near-identical files" shape legitimately still holds as a low-priority cleanup candidate.                                                         |
| 22  | Low      | Invoke        | Typo in user-facing error message ("servleress.yml")                                                         | **Resolved.** `invoke/scalewayInvoke.ts` reads "...not defined in serverless.yml".                                                                                                                                                                                                                                                                                            |

---

## Critical

### 1. TLS certificate verification disabled for all API traffic

**File:** `shared/api/utils.js:8-19`

```js
function getApiManager(apiUrl, token) {
  return axios.create({
    baseURL: apiUrl,
    headers: { "User-Agent": ..., "X-Auth-Token": token },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });
}
```

Every `apiManager` created by `FunctionApi`, `ContainerApi`, `AccountApi`, and `RegistryApi` goes through this, unconditionally. `rejectUnauthorized: false` disables TLS certificate validation, so any request — including the one carrying the user's `X-Auth-Token` secret key in a header — is vulnerable to a man-in-the-middle on the network path (rogue Wi-Fi, compromised proxy, DNS spoofing) intercepting or tampering with API traffic and the auth token itself. There is no dev-only flag gating this; it applies in production use of the plugin.

**Fix:** remove `httpsAgent: new https.Agent({ rejectUnauthorized: false })` entirely (axios verifies certs by default). If this was added to work around a specific self-signed/internal endpoint, gate it behind an explicit opt-in env var (e.g. `SCW_INSECURE_TLS=1`) documented as dangerous, not the default.

---

## High

### 2. `manageError` silently swallows some errors

**File:** `shared/api/utils.js:36-57`

```js
function manageError(err) {
  err.response = err.response || {};
  if (!err.response || !err.response.data) {
    throw new Error(err);
  }
  if (err.response.data.message) {
    ...
    throw new CustomError(message, err.response);
  } else if (err.response.data.error_message) {
    throw new CustomError(err.response.data.error_message, err.response);
  }
  // falls through here without throwing if err.response.data exists
  // but has neither `.message` nor `.error_message`
}
```

If the API ever returns an error body that doesn't have a `message` or `error_message` field, `manageError` returns `undefined` instead of throwing. Every `.catch(manageError)` call site then resolves successfully with `undefined` instead of rejecting.

**Concrete crash this causes today:** `shared/api/triggers.js:6-28` (`listTriggersForApplication`):

```js
const cronTriggers = await this.apiManager.get(cronTriggersUrl)
  .then((response) => response.data.crons)
  .catch(manageError);
...
return [...cronTriggers, ...messageTriggers];
```

If either request hits this error shape, `cronTriggers`/`messageTriggers` is `undefined`, and the spread throws `TypeError: cronTriggers is not iterable` — a much less helpful error than the original API error would have been, and it aborts `deployTriggers` entirely.

**Fix:** always throw in `manageError`, e.g. fall through to `throw new CustomError(JSON.stringify(err.response.data), err.response)` when neither field is present, instead of returning implicitly.

### 3. Trigger delete/create calls aren't awaited — likely root cause of remaining 409s

**File:** `deploy/lib/deployTriggers.js:44-101`

```js
deletePreviousTriggersForApplication(application) {
  const deleteTriggersPromises = application.currentTriggers.map((trigger) => {
    if ("schedule" in trigger) {
      this.deleteCronTrigger(trigger.id);       // <-- not returned
    } else {
      this.deleteMessageTrigger(trigger.id);     // <-- not returned
    }
  });
  return Promise.all(deleteTriggersPromises);    // resolves with [undefined, undefined, ...]
},
```

and identically in `createNewTriggersForApplication` (lines 74-98): none of the three branches (`this.createCronTrigger(...)`, the two `this.createMessageTrigger(...)` calls) is `return`ed from the `.map()` callback.

Because the map callbacks don't return the request promises, `Promise.all(...)` resolves on the next microtask — **not** when the underlying HTTP calls complete. `manageTriggers` chains delete → create:

```js
this.getTriggersForApplication(application, isFunction)
  .then((appWithTriggers) =>
    this.deletePreviousTriggersForApplication(appWithTriggers),
  )
  .then(() => this.createNewTriggersForApplication(application, isFunction));
```

so "create" is fired essentially immediately after "delete", while the delete HTTP requests are still in flight — a race that plausibly reproduces exactly the "HTTP 409 (trigger already exists)" symptom the recent fix (`2d33523`) targeted. That commit only reordered lifecycle hooks in `deploy/scalewayDeploy.js` and changed env/secret defaulting in `shared/setUpDeployment.js`; it did not touch this file, so this race is still present.

`git log -p` on this file shows the bug was introduced by commit `dc8e0608` ("Include function message trigger for NATS event"), which rewrote single-expression arrows that _did_ return (`(trigger) => this.deleteTrigger(trigger.id)`) into block-body arrows to add schedule/nats branching, and dropped the `return` in the process. `printDeployedTriggersForApplication` then logs "Deployed a new trigger" once per event regardless of whether creation actually succeeded (it iterates the `[undefined, ...]` array from `createNewTriggersForApplication`), and any real creation/deletion error becomes an unhandled promise rejection instead of failing the deploy.

**Fix:** add `return` before each `this.delete*Trigger(...)` / `this.create*Trigger(...)` call inside both `.map()` callbacks. Verify against `test:triggers`, since this directly targets the still-open 409 symptom.

### 4. List endpoints don't paginate — truncated results corrupt pruning and create/update matching

**Files:** `shared/api/namespaces.js:6-13` (`listNamespaces`, hardcoded `page_size=100`), `shared/api/functions.js:6-12` (`listFunctions`, no `page_size` at all → API default), `shared/api/containers.js:8-14` (`listContainers`, same).

None of these follow the API's pagination (no loop over `page`, no use of a `total_count`/next-page header). For any project with more resources than a single page:

- `createOrUpdateFunctions`/`createOrUpdateContainers` (`deploy/lib/createFunctions.js:33`, `createContainers.js:105`) match config-defined names against `foundFunctions`/`foundContainers` from this truncated list — a function that exists on page 2 looks "not found" and gets recreated, which fails with a name-conflict error from the API.
- `singleSource.getElementsToDelete` (see #16) only sees page-1 resources, so functions/containers removed from `serverless.yml` that happen to live beyond page 1 are silently never pruned.

**Fix:** implement pagination in these three functions (loop while `response.data.<key>.length === page_size`, incrementing `page`, or use `total_count` if the API returns it) before returning the aggregated list.

### 5. `waitForFunctionStatus`/`waitForContainer`: over-broadened error tolerance crashes deploy differently

**Files:** `shared/api/functions.js:98-128`, `shared/api/containers.js:96-126`

```js
.catch((err) => {
  // toleration on 4XX errors because on some status, for example deleting the API
  // will return a 404 err code if item has been deleted.
  if (err.response === undefined) {
    throw err;
  } else if (err.response.status >= 500) {
    throw new Error(err);
  }
  // any other 4xx: falls through, resolves to `undefined`
});
```

This is the code landed by `dca4f5b` ("fix(containers): do not crash because of unhandled error"), which fixed a real crash (`err.response.status` throwing when `err.response` was `undefined`) but broadened the "safe to ignore" case from "404 specifically, because the resource was already deleted" to "any 4xx". `waitForFunctionStatus`/`waitForContainer` are also used during the **deploy** wait (not just delete):

```js
// deploy/lib/deployFunctions.js:16-23
return this.deployFunction(func.id, {})
  .then((func) => { ...; return func; })
  .then((func) => this.waitForFunctionStatus(func.id, "ready"))
  .then((func) => this.printFunctionInformationAfterDeployment(func))
```

If the API returns any other 4xx while polling for `"ready"` (e.g. a transient 400/403), `waitForFunctionStatus` now resolves to `undefined`, and `printFunctionInformationAfterDeployment` does `func.name` / `func.domain_name` on `undefined`, throwing `TypeError: Cannot read properties of undefined` — a confusing crash that replaces one bug with another, and gives the user no indication of the actual API error.

**Fix:** only tolerate `404` (the documented "already deleted" case), not the whole 4xx range; re-throw everything else so it surfaces as a real error instead of `undefined`.

### 6. `serverless jwt` issues function tokens for containers

**File:** `jwt/lib/getJwt.js:73-89`

```js
getJwtContainers(containers) {
  const promises = containers.map((container) => {
    if (container.privacy === PRIVACY_PRIVATE) {
      return this.issueJwtFunction(container.id, this.tokenExpirationDate)   // <-- should be issueJwtContainer
        ...
```

`issueJwtFunction` (`shared/api/jwt.js:14-20`) calls `issue-jwt?function_id=${functionId}...`; passing a container's ID as `function_id` means the API is asked to issue a JWT scoped to a function that doesn't exist (the container's ID never matches a function record). Copy/paste from `getJwtFunctions` just above it. `serverless jwt` for a container-based service with `privacy: private` containers is broken.

**Fix:** `this.issueJwtContainer(container.id, this.tokenExpirationDate)`.

(Note: `getJwt()`'s own dispatch at the top of this file, `typeof this.listFunctions === "function"` vs `typeof this.listContainers === "function"`, is _not_ a bug — `shared/api/endpoint.js`'s `getApi()` instantiates exactly one of `FunctionApi`/`ContainerApi` per plugin instance depending on config, so only one of those methods is ever present on `this`, and the `typeof` check correctly distinguishes function services from container services.)

### 7. Region from the local Scaleway CLI config file is silently discarded

**File:** `provider/scalewayProvider.js:110-122` (`setCredentials`) and `:135-150` (`setApiURL`)

`setCredentials` reads `scwConfig.default_region` into `this.scwRegion` when falling back to `~/.config/scw/config.yaml` (the case where no `scw-region` CLI flag, `SCW_REGION` env var, or `scwToken`/`scwProject` in `serverless.yml` are set). But `initialize()` (`:152-161`) always calls `setApiURL(options)` immediately after `setCredentials(options)`, and `setApiURL` unconditionally recomputes `this.scwRegion` from its own precedence chain — `options["scw-region"] || process.env.SCW_REGION || this.serverless.service.provider.scwRegion || DEFAULT_REGION` — which never looks at the value `setCredentials` just set.

**Concrete failure:** a user whose only region configuration is `default_region: nl-ams` in `~/.config/scw/config.yaml` (no `scwRegion` in `serverless.yml`, no CLI flag, no env var) silently deploys to `fr-par` instead of `nl-ams`. No error, no warning — resources are simply created in the wrong region.

**Fix:** have `setApiURL` fall back to the region `setCredentials` already resolved (e.g. pass it through or check `this.scwRegion` before defaulting), instead of re-deriving it from scratch and ignoring prior state.

### 8. Partial `scwToken`/`scwProject` in `serverless.yml` crashes with an unhelpful `TypeError`

**Files:** `provider/scalewayProvider.js:100-109`, `shared/validate.js:161-172`

`setCredentials` enters the "credentials from serverless.yml" branch on an **OR** (`provider.scwToken || provider.scwProject`) but then unconditionally assigns both fields from the yml, so one of `this.scwToken`/`this.scwProject` can end up `undefined` if the user only set one. `validateCredentials` then calls `.length` on both without a null check:

```js
if (
  this.provider.scwToken.length !== 36 ||
  this.provider.getScwProject().length !== 36
) { ... }
```

If only one is set, this throws `TypeError: Cannot read properties of undefined (reading 'length')` instead of the friendly message the code clearly intends to show ("Either scwToken or scwProject is invalid...").

**Fix:** guard with `!this.provider.scwToken || this.provider.scwToken.length !== 36` (and the same for the project), so a missing value hits the intended error message instead of crashing.

---

## Medium

### 9. Delete-confirmation log fires before deletion is actually confirmed

**File:** `deploy/lib/createFunctions.js:20-31`

```js
deleteFunctionsByIds(funcIdsToDelete) {
  funcIdsToDelete.forEach((funcIdToDelete) => {
    this.deleteFunction(funcIdToDelete).then((res) => {
      this.serverless.cli.log(`Function ${res.name} removed from config file, deleting it...`);
      this.waitForFunctionStatus(funcIdToDelete, "deleted").then(
        this.serverless.cli.log(`Function ${res.name} deleted`)   // <-- calls cli.log() immediately,
      );                                                           //     passes its return value (undefined) to .then()
    });
  });
},
```

`this.serverless.cli.log(...)` is invoked immediately as an argument, not wrapped in a callback — so "Function X deleted" prints right after the delete request is issued, not after `waitForFunctionStatus` actually confirms deletion. `.then(undefined)` is a no-op passthrough, so any error from `waitForFunctionStatus` also becomes an unhandled rejection instead of being logged or failing the deploy. The whole `deleteFunctionsByIds` call is itself fire-and-forget from its caller (`createOrUpdateFunctions`, no `return`/`await`), so a failed delete never fails `serverless deploy` either. Compare `deleteContainersByIds` (`deploy/lib/createContainers.js:63-74`), which correctly wraps the log in `.then(() => {...})` — the two paths have already drifted (see #21).

**Fix:** `this.waitForFunctionStatus(funcIdToDelete, "deleted").then(() => this.serverless.cli.log(...))`, add a `.catch`, and thread `return`s up through `deleteFunctionsByIds` to its caller so deletion is part of the awaited deploy flow.

### 10. Domain-deployment wait isn't awaited

**Files:** `deploy/lib/deployFunctions.js:41-52` (`waitForDomainsDeployment`), `deploy/lib/deployContainers.js:9-27` (`printContainerEndpointsAfterDeployment`, inner `.then` at line 19)

```js
waitForDomainsDeployment(func) {
  this.serverless.cli.log(`Waiting for ${func.name} domains deployment...`);
  this.waitDomainsAreDeployedFunction(func.id).then((domains) => {   // <-- not returned
    ...
  });
},
```

`waitForDomainsDeployment` is the last step of each per-function deploy chain (`deployFunctions.js:23`), but since it doesn't return the promise it kicks off, `deployEachFunction`'s `BbPromise.map` considers that function "done" before its domains are actually confirmed ready. `serverless deploy` can print its final success message and the process can exit while domain readiness is still being polled in the background — losing the "Domain ready" log lines, and turning any domain-deployment error (`waitDomainsAreDeployedFunction` throws on `domain.status === "error"`) into an unhandled rejection instead of a deploy failure. The container path has the same issue nested inside a `.forEach`.

Also affected: `applyDomainsFunc`/`applyDomainsContainer` (`deploy/lib/createFunctions.js:65-91`, `createContainers.js:76-103`) are likewise called without `return`/`await` from `updateSingleFunction`/`updateSingleContainer`, and their internal `this.listDomainsFunction(...).then(...)` chain has no `.catch` — see #13.

**Fix:** `return this.waitDomainsAreDeployedFunction(func.id).then(...)` (and same for the container version).

### 11. Registry namespace listing uses the wrong query param, breaking project scoping

**File:** `shared/api/registry.js:11-16`

```js
listRegistryNamespace(projectId) {
  return this.apiManager.get(`namespaces?projectId=${projectId}`)   // camelCase
    ...
```

Every other project-scoped list call in this codebase uses the API's actual `snake_case` parameter, e.g. `shared/api/namespaces.js:6-13`: `` `namespaces?page_size=100&project_id=${projectId}` ``. `projectId` (camelCase) is not a parameter the Scaleway API recognizes, so it's silently ignored — `listRegistryNamespace` returns registry namespaces across **all** accessible projects, not just the current one.

**Fix:** `` `namespaces?project_id=${projectId}` ``.

### 12. `serverless invoke` cannot reach private functions/containers, isn't awaited, and crashes on a name mismatch

**File:** `invoke/scalewayInvoke.js:50-65`

```js
function doInvoke(found) {
  let func = found.find((f) => f.name === this.options.function);
  const url = "https://" + func.domain_name;               // <-- crashes if find() returns undefined

  axios.get(url)                       // <-- no Authorization header
    .then((res) => { process.stdout.write(...); })
    .catch((error) => { process.stderr.write(...); });
  // no `return` — the invoke:invoke hook's promise chain doesn't wait for this
}
```

Three distinct issues in this function:

- No auth token is attached, so invoking a `privacy: private` function/container (the plugin's own `jwt` command exists specifically to obtain tokens for this) will always fail with an auth error from the API, with no indication in this code that private resources need different handling.
- `found.find(...)` can return `undefined` — e.g. the name is defined in `serverless.yml` (so `validateFunctionOrContainer` passes) but hasn't actually been deployed yet, or was deployed under a different derived name — and `func.domain_name` then throws a low-level `TypeError` instead of a clear "not deployed yet" message.
- `doInvoke` isn't returned from the `.then(doInvoke)` chain in `this.hooks["invoke:invoke"]`, so the CLI process can exit before the `axios.get` promise settles, silently dropping the invoke's output in scripted/CI usage.

Also, line 35's error message has a typo: "not defined in **servleress.yml**" — see #22.

**Fix:** check `func` is defined before use and throw a clear error if not; for private functions, fetch a JWT (reuse `issueJwtFunction`/`issueJwtContainer`, already used by the `jwt` command) and send it as a header before invoking; `return axios.get(url)...` so the hook awaits completion.

### 13. `createDomainAndLog` is fire-and-forget

**File:** `shared/api/domain.js:35-54`

```js
createDomainAndLog(createDomainParams) {
  this.createDomain(createDomainParams)     // <-- no `return`
    .then((res) => { this.serverless.cli.log(`Creating domain ${res.hostname}`); })
    .then(() => {}, (reason) => { this.serverless.cli.log(`Error on domain : ...`); });
},
```

Called from `applyDomainsFunc`/`applyDomainsContainer`, which are themselves not returned/awaited from `updateSingleFunction`/`updateSingleContainer` (see #10). The whole custom-domain-creation path is disconnected from the deploy promise chain: failures are only ever logged, never fail `serverless deploy`, and `serverless deploy` can finish (and the process exit) before domain creation is even attempted.

**Fix:** thread `return` through `createDomainAndLog` → `applyDomainsFunc`/`applyDomainsContainer` → their callers, so domain creation is part of the awaited deploy chain and its errors can actually fail the deploy (or be deliberately caught and downgraded to a warning, but on purpose, not by accident).

### 14. `.dockerignore` contents are never applied to the build context

**File:** `deploy/lib/buildAndPushContainers.js:48-74` (`getFilesInBuildContextDirectory`)

```js
} else if (dirent.isFile() && dirent.name !== ".dockerignore") {
  // Don't include .dockerignore file in result
  files.push(dirent.name);
}
```

This only special-cases the filename `.dockerignore` itself (excludes that one file from the build context), but never reads or parses the ignore _patterns_ inside it. The file list (`src`) is built manually by walking the directory tree and passed straight to the Docker build call, bypassing Docker's own automatic `.dockerignore` handling entirely.

**Concrete failure:** a user who adds a `.dockerignore` with `node_modules`, `.env`, `.git`, etc. — specifically to keep image size down or keep secrets out of the image — gets none of that honored; everything on disk under the container's `directory` is included in the build context and can end up in the image regardless.

**Fix:** parse `.dockerignore` (a minimal glob-pattern matcher, or a small existing library) and filter `files` against it before passing to `dockerode`, matching Docker's own semantics.

### 15. Nothing rejects defining both `functions` and `custom.containers`

**Files:** `shared/validate.js:308-329`, `shared/api/endpoint.js:4-24`, `deploy/scalewayDeploy.js` (`chainContainers`/`chainFunctions`)

`validate.js` only errors when **neither** `functions` nor `custom.containers` is defined (`"You must define at least one function or container..."`); it never rejects the case where **both** are defined in the same `serverless.yml`. Meanwhile `shared/api/endpoint.js`'s `getApi()` picks exactly one API implementation for the whole plugin instance — it checks `custom.containers` first, then unconditionally overwrites `api` with `FunctionApi` if `functions` is also present, so `functions` silently wins whenever both are set. But `deploy/scalewayDeploy.js`'s `chainContainers()`/`chainFunctions()` each independently re-check the raw config and will _both_ run in the same `deploy:deploy` hook regardless of which API got selected.

**Concrete failure:** a service that accidentally has leftover `custom.containers` config (e.g. mid-migration between functions and containers) alongside `functions` gets a `FunctionApi` instance with no container-specific methods (`createContainer`, `listContainers`, etc.), so `chainContainers()` crashes with a low-level `TypeError` (`this.createContainer is not a function`-shaped) instead of the clear "you can't define both" validation error a user would expect.

**Fix:** add a validation check rejecting the case where both `functions` and `custom.containers` are non-empty, with a clear error message, alongside the existing "define at least one" check.

---

## Low / code quality

### 16. `getElementsToDelete`: dead comparison + non-mutating `slice`

**File:** `shared/singleSource.js:14-24`

```js
for (let i = 0; i < existingServicesOnApi.length; i++) {
  const apiService = existingServicesOnApi[i];
  for (let ii = 0; ii < serviceNamesRet.length; ii++) {
    const serviceName = serviceNamesRet[ii];
    if (apiService === serviceName) {
      // object === string: never true
      serviceNamesRet.slice(ii, 1); // slice() doesn't mutate; return value discarded
      break;
    }
  }
  if (!serviceNamesRet.includes(apiService.name)) {
    elementsIdsToRemove.push(apiService.id);
  }
}
```

`apiService` (an object with `.id`/`.name`) is compared to `serviceName` (a plain string) with `===`, which is never true, so the inner branch never runs. Even if it did, `.slice(ii, 1)` returns a new array without modifying `serviceNamesRet` in place — its result is discarded, so nothing would be removed from the list either way.

Currently this is inert: the actual pruning decision on the next line (`!serviceNamesRet.includes(apiService.name)`) reads from the original, untouched `serviceNamesRet`, so today's behavior happens to be correct despite the dead code. Flagging it because (a) it reads as intentional logic that silently does nothing, and (b) a future "fix" that makes the inner loop actually mutate `serviceNamesRet` would introduce a real bug: `serviceNamesRet` is the same array reference as the `servicesNames` parameter (`const serviceNamesRet = servicesNames;`, line 5), so mutating it during iteration would corrupt the caller's array while `createOrUpdateFunctions`/`createOrUpdateContainers` are also iterating over it.

**Fix:** delete the dead inner loop entirely — it serves no purpose given the `includes()` check already does the job. Do not "fix" it into a mutating splice without also making `serviceNamesRet` a copy (`[...servicesNames]`).

### 17. Unbounded polling loops

**Files:** `shared/api/namespaces.js` (`waitNamespaceIsReady`, `waitNamespaceIsDeleted`), `shared/api/functions.js` (`waitFunctionsAreDeployed`, `waitForFunctionStatus`, `waitDomainsAreDeployedFunction`), `shared/api/containers.js` (`waitContainersAreDeployed`, `waitForContainer`, `waitDomainsAreDeployedContainer`).

All of these recurse via `setTimeout` indefinitely with no maximum attempt count or overall timeout. If the API ever leaves a resource in a persistent non-final, non-error status (a backend bug, a stuck reconciliation), `serverless deploy`/`remove`/`jwt` hangs forever with no user-facing timeout — the only way out is Ctrl+C. Not urgent (requires a backend-side anomaly to trigger), but worth a bounded retry count with a clear "timed out waiting for X to become ready" error.

### 18. `waitNamespaceIsDeleted` discards the real error behind a generic message

**File:** `shared/api/namespaces.js:72-91`

```js
.catch((err) => {
  if (err.response && err.response.status === 404) {
    return true;
  }
  throw new Error("An error occured during namespace deletion");
});
```

Any non-404 failure while polling for namespace deletion — a transient 5xx, a network blip, or a `CustomError` from `manageError` with a genuinely useful message — is replaced with this generic string, discarding the actual cause. Combined with #17 (no bound on the "deleting" status loop), a stuck delete gives the user very little to act on: either it hangs forever, or it fails with a message that tells them nothing about why.

**Fix:** preserve `err`/`err.message` in the thrown error instead of replacing it, e.g. ``throw new Error(`An error occurred during namespace deletion: ${err.message}`)``.

### 19. `serverless info` has no `.catch`

**File:** `info/lib/display.js:9-44`

The `getNamespaceFromList(...).then(...)` chain, and the nested `listContainers(...).then(...)` / `listFunctions(...).then(...)` calls inside it, have no `.catch` anywhere and aren't returned from `displayInfo()`. Any API failure (auth error, 500, network issue) during `serverless info` becomes an unhandled promise rejection rather than the clean error message the `dca4f5b` fix aimed for elsewhere in the codebase.

### 20. Dead code in container build

**File:** `deploy/lib/buildAndPushContainers.js:135-143`

```js
const inspectedImage = await image.inspect().catch(() => {
  throw new Error(
    `Image ${imageName} does not exist: run --verbose to see errors`,
  );
});
if (inspectedImage === undefined) {
  return;
}
```

The `.catch` callback always throws, so `inspectedImage` can never be `undefined` when execution reaches the `if` — it's unreachable. Harmless, just remove it for clarity.

### 21. Duplicated, drifting create/update logic between functions and containers

**Files:** `deploy/lib/createFunctions.js` vs `deploy/lib/createContainers.js` (~80 lines each of near-identical param-building/create/update/delete logic).

Not urgent, but the two paths have already drifted in subtle ways beyond their genuinely different fields (e.g. functions use `BbPromise.map(..., {concurrency: 1})` for create/update while containers use a plain `Promise.all` with an explicit `waitForContainer` gate before updating; `deleteFunctionsByIds` has the `.then(cli.log(...))` bug from #9 that `deleteContainersByIds` does not). Worth extracting the shared shape (delete-by-ids, create-or-update dispatch) into one helper parameterized by the function/container-specific bits, so a fix like #9 or #10 only has to be made once. Flagging as low priority — mechanical, but touches a lot of surface area, so it should follow the correctness fixes above, not precede them.

### 22. Typo in user-facing error message

**File:** `invoke/scalewayInvoke.js:35`

```js
const msg = `Function or container ${this.options.function} not defined in servleress.yml`;
```

"servleress.yml" → "serverless.yml". Cosmetic, but user-visible.

---

## Fixing plan (priority order)

Grouped into passes so each can be its own PR, tested independently, and reviewed against the existing integration test suites (`npm run test:deploy`, `test:functions`, `test:containers`, `test:triggers`, `test:shared`, `test:provider` — see root `CLAUDE.md`).

**Pass 1 — Security (do first, no behavior debate needed):**

- #1 Remove `rejectUnauthorized: false`.
- #14 Honor `.dockerignore` contents when building the container image context.

**Pass 2 — Silent-failure correctness (highest risk of masking real deploy failures):**

- #2 Make `manageError` always throw.
- #5 Narrow the 4xx tolerance in `waitForFunctionStatus`/`waitForContainer` back to 404-only.
- #3 Add the missing `return`s in `deployTriggers.js` (delete/create trigger races) — verify against `test:triggers`, since this directly targets the still-open 409 symptom.
- #10 Await domain-deployment waits in `deployFunctions.js`/`deployContainers.js`.
- #13 Thread `return` through the custom-domain-creation chain.
- #9 Fix the `.then(cli.log(...))` bug in `deleteFunctionsByIds`.
- #12 Return the invoke promise chain in `scalewayInvoke.js` and guard against an unmatched name (auth-header support for private functions can follow in its own PR since it's a feature gap, not a regression).

Each of these is a small, targeted diff (mostly adding `return`, fixing an argument, or narrowing a condition) — low risk individually.

**Pass 3 — Provider/config correctness:**

- #7 Make `setApiURL` respect the region `setCredentials` already resolved from `~/.config/scw/config.yaml`.
- #8 Guard `validateCredentials` against a missing `scwToken`/`scwProject` instead of crashing.
- #15 Reject `serverless.yml` files that define both `functions` and `custom.containers`.

**Pass 4 — Data correctness:**

- #4 Add pagination to `listNamespaces`/`listFunctions`/`listContainers`.
- #11 Fix the registry namespace query param.
- #6 Fix the `getJwtContainers` copy/paste bug.
- #16 Delete the dead inner loop in `getElementsToDelete` (cleanup, no behavior change expected — add a regression test asserting the pruning decision is unaffected before/after).

**Pass 5 — Robustness (lower urgency, larger surface):**

- #17 Add a bounded retry/timeout to the `wait*` polling functions.
- #18 Preserve the real error in `waitNamespaceIsDeleted` instead of a generic message.
- #19 Add `.catch` + `return` to `info/lib/display.js`.
- #12 (feature part) Wire JWT auth into `serverless invoke` for private functions/containers.

**Pass 6 — Cleanup (do last, purely mechanical):**

- #20 Remove dead code in `buildAndPushContainers.js`.
- #22 Fix the "servleress.yml" typo.
- #21 Extract shared create/update/delete helper for functions vs. containers, now that passes 1-4 have already fixed the bugs that would otherwise need fixing twice.

---

# Modernization: Bluebird removal & dependency staleness

Added 2026-08-26, as a follow-up investigation separate from the 22 findings above (different concern: not bugs, but old libraries/patterns worth updating). Scope: `bluebird` usage across the plugin, `npm audit`/`npm outdated` results, the Node versions CI tests against, and a scan for other legacy JS patterns (`var`, deprecated Node APIs, manually-wrapped callback APIs).

## Summary

| #   | Area         | One-liner                                                                                                                                                                                                                                                                                                       |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Runtime dep  | `bluebird` (last released 2019) is used only for `.bind(this)` promise-chaining and two `.map(..., {concurrency})` calls — both have clean native replacements                                                                                                                                                  |
| M2  | Security     | `axios` (target latest `1.20.0`) and `js-yaml` (target latest patched 4.x `4.3.1` now, true latest `5.4.0` as a deliberate separate bump) have high-severity CVEs                                                                                                                                               |
| M3  | Security     | `dockerode` (target latest `5.0.1`) and `argon2` (target latest `0.45.1`) have vulnerabilities needing a major-version bump — go straight to latest, not an intermediate version                                                                                                                                |
| M4  | CI           | Test matrix still runs on Node 18.x, which reached end-of-life in April 2025                                                                                                                                                                                                                                    |
| M5  | Code quality | `uploadCode.js` hand-wraps the old callback-style `fs.readFile` instead of using `fs/promises`, and the hand-wrapping has a latent double-settle bug                                                                                                                                                            |
| M6  | Tooling      | Every dev dependency has a newer release; targets: `eslint`→`10.9.1`, `prettier`→`3.9.6`, `jest`→`30.4.x`, `fs-extra`→`11.4.0` (trivial), `rewire`→`9.0.1` (or drop it, see M7)                                                                                                                                 |
| M7  | Tooling      | Bun can cleanly replace `npm install`/`npm run` (re-verified post-TS-migration); replacing `jest` is down to one remaining blocker — `rewire` resolved, `@jest/globals` fixed (Pass M-5b), `export =` (not `import`) is the real fix needed for the last one — no Bun equivalent exists for `eslint`/`prettier` |
| M8  | Test infra   | Running multiple live suites concurrently on one machine (not CI, which uses separate runners) has a narrow race in `npm link --force`'s shared global symlink — optional, low priority                                                                                                                         |
| M9  | Tooling      | Biome could replace ESLint+Prettier (real parity, both npm-current and well past 1.0) — **not confirmed we'll migrate**; still an open question, see below                                                                                                                                                      |

---

## M1. Removing Bluebird — **Resolved, 2026-08-26/27.** `bluebird`/`BbPromise` no longer appears anywhere in the codebase (`grep -rln "bluebird\|BbPromise"` returns nothing) — fully removed as part of the TS/SDK rewrite, not via the staged plan below.

**Files:** 16 files import `bluebird` as `BbPromise` — `deploy/scalewayDeploy.js`, `deploy/lib/{createFunctions,createContainers,createNamespace,deployFunctions,deployTriggers,uploadCode}.js`, `invoke/scalewayInvoke.js`, `remove/{scalewayRemove,lib/removeNamespace}.js`, `jwt/{scalewayJwt,lib/getJwt}.js`, `logs/{scalewayLogs,lib/getLogs}.js`, `info/scalewayInfo.js`, `shared/validate.js`.

`bluebird@3.7.2` (the version pinned here) was last published in November 2019. It predates async/await being safe to rely on everywhere (Node 8+), which is the actual reason it's here — but this plugin's own `engines` requirement (via CI: Node 18.x/20.x) has long since made every native alternative available. There are exactly three distinct things it's used for:

### a. `BbPromise.bind(this)` — by far the dominant use (13 of 16 files)

```js
// deploy/scalewayDeploy.js
"before:deploy:deploy": () =>
  BbPromise.bind(this).then(this.setUpDeployment).then(this.validate),
```

`.bind(ctx)` makes every subsequent `.then()` callback in the chain run with `this` set to `ctx`, even when the callback is passed as a bare method reference (`this.setUpDeployment`, not `() => this.setUpDeployment()`) — which is what every one of these chains does. Without Bluebird, a bare method reference passed to native `.then()` loses its receiver and `this` is `undefined` inside it (strict mode).

Two native-only replacement patterns, in order of preference:

1. **async/await** (cleanest — matches how the rest of modern JS in this codebase already reads): every hook definition here is itself an arrow function that already closes over the outer `this` (e.g. `"jwt:jwt": () => BbPromise.bind(this).then(this.getJwt)` — the outer `() =>` already captures `this` from the class instance). Rewriting the body to call methods directly preserves `this` for free, since `this.getJwt()` is a normal method call through property access:

   ```js
   "jwt:jwt": () => this.getJwt(),
   ```

   For multi-step chains, same idea with explicit `await`:

   ```js
   // deploy/lib/createNamespace.js
   async createServerlessNamespace() {
     const exists = await this.namespaceExists();
     if (exists) return;
     await this.createNamespace(...);
     return this.updateNamespaceConfiguration();
   }
   ```

2. **Explicit arrow wrapping**, where a full async/await rewrite of a large method isn't worth doing in the same pass: `.then((functions) => this.createOrUpdateFunctions(functions))` instead of `.then(this.createOrUpdateFunctions)`. Slightly more verbose but a smaller diff per call site.

`async/await` is the better target long-term — several of the chains this plan already touched (Pass 2 in particular) needed `Promise.all`/explicit `return`s precisely because the promise-chaining style here is easy to get subtly wrong (see findings #3, #9, #10, #13). `async/await` makes "did I return/await this" a much harder mistake to make by construction.

### b. `BbPromise.map(items, iteratee, { concurrency: N })` — 2 call sites

```js
// deploy/lib/createFunctions.js — sequential, concurrency: 1
return Promise.all([
  this.deleteFunctionsByIds(deleteData.elementsIdsToRemove),
  BbPromise.map(
    deleteData.serviceNamesRet,
    (functionName) => { ... },
    { concurrency: 1 }
  ).then((updatedFunctions) => { this.functions = updatedFunctions; }),
]);

// deploy/lib/deployFunctions.js — bounded parallel, concurrency: 5
const DEPLOY_FUNCTIONS_CONCURRENCY = 5;
return BbPromise.map(this.functions, (func) => { ... }, { concurrency: DEPLOY_FUNCTIONS_CONCURRENCY });
```

Native `Promise` has no bounded-concurrency map. Two different replacements for two different needs:

- `createFunctions.js`'s `{concurrency: 1}` is just sequential execution — trivially a `for...of` loop with `await` inside, no library needed:
  ```js
  const updatedFunctions = [];
  for (const functionName of deleteData.serviceNamesRet) {
    updatedFunctions.push(await (foundFunc ? this.updateSingleFunction(...) : this.createSingleFunction(...)));
  }
  ```
- `deployFunctions.js`'s `{concurrency: 5}` is genuine bounded parallelism (real rate-limit protection against the Scaleway API) and needs an actual concurrency limiter. Options, roughly in order of how little they add:

  1. A ~15-line hand-rolled limiter (a worker-pool loop over an index counter) — zero new dependencies.
  2. `p-limit` (small, actively maintained, ESM-only in recent majors — check it works from this repo's CommonJS setup, or pin an older CJS-compatible version).

  Don't replace this with a plain `Promise.all` (unlimited concurrency) — that changes real behavior (defeats the rate-limit protection this value exists for), not just the implementation.

### c. `BbPromise.resolve()` / `BbPromise.reject(errors)` — `shared/validate.js`, `deploy/lib/createNamespace.js`

Direct 1:1 native equivalents: `Promise.resolve()` / `Promise.reject(errors)`. No behavior difference — trivial find-and-replace.

**Suggested order:** do (c) and the leaf files with only `.bind(this)` first (mechanical, low risk, quick to review), then (b) since it's self-contained and testable in isolation, then work through the `.bind(this)`-heavy hook files last since those are the ones worth actually rewriting to async/await rather than just pattern-replacing (highest value, but touches the most call sites — worth its own PR per file or small group of files, with the existing test suites as the regression net). Once all 16 files are migrated, remove `bluebird` from `package.json` `dependencies` entirely.

---

## M2. Dependency CVEs fixable within the existing semver range — and how far past that to actually go — **Resolved, exceeded.** `axios` is at `1.20.0`, `js-yaml` at `5.4.1` — past this section's staged "4.3.1 now, 5.4.0 later" target, already on the 5.x line (bumped 2026-08-27).

`npm audit --omit=dev` reports 22 vulnerabilities in the production dependency tree (2 low, 6 moderate, 10 high, 4 critical). Most of the critical/high ones (`tar`, `decompress`, `protobufjs`, `form-data`, `@grpc/grpc-js`, `lodash`, `minimatch`, `brace-expansion`) are _transitive_ dependencies of `@serverless/utils` (already at its latest release, `6.15.0`) or of `dockerode`'s own dependency tree, pulled in for parts of those packages this plugin doesn't use (this plugin only imports `@serverless/utils/log`). Not independently actionable without upstream releases from those packages.

Two direct dependencies have high-severity CVEs, and for both the target should be **the actual latest release**, not just the nearest patched version — going further costs nothing extra here since neither crosses a major version to get there:

- **`axios`** (`^1.4.0` in `package.json`, resolved to `1.9.0`, vulnerable range `1.0.0 - 1.17.0`, CVE-fixed version and the package's true latest are the same release, `1.20.0`): a long list of CVEs (SSRF via `NO_PROXY` bypass, prototype-pollution-based request/response tampering, ReDoS, several DoS vectors) fixed across 1.18–1.20. Since `getApiManager()` (`shared/api/utils.js`) is the single chokepoint every API call goes through, this is worth prioritizing — it's the plugin's entire network surface. **Target: `1.20.0`** (bump `package.json`'s range to `^1.20.0` so the lockfile can't silently drift back down).
- **`js-yaml`**: two separate decisions here, not one. The CVE fix (prototype pollution and quadratic-complexity DoS via YAML merge-key handling) lands in `4.3.1`, still inside the `^4.1.0` range `package.json` already declares — that part is free, no code changes. The package's true latest, `5.4.0`, is a separate major-version jump beyond the CVE fix, with its own breaking-change surface to check (js-yaml's own changelog before committing to it) — treat that as its own decision, not bundled into the CVE fix. **Target now: `4.3.1`** (free); **target later, deliberately: `5.4.0`** (its own PR, see below).

**Fix (now):** bump `axios` to `1.20.0` and `js-yaml` to `4.3.1` in `package.json`/`package-lock.json`, re-run the full test suite. No source changes expected for either.

**Fix (separate, deliberate follow-up):** evaluate `js-yaml` 5.x on its own — it's used in exactly one place (`provider/scalewayProvider.js`, parsing `~/.config/scw/config.yaml`), so the blast radius of checking its migration guide is small.

## M3. Dependency CVEs needing a major version bump — go to latest, not just "patched enough" — **Resolved.** `dockerode` at `5.0.1`, `argon2` at `0.45.1` — match this section's targets exactly.

- **`dockerode`** (`^4.0.6`, resolved `4.0.6`, latest `5.0.1`, `isSemVerMajor: true`): moderate-severity, via a vulnerable `uuid` sub-dependency. `dockerode` is the library `deploy/lib/buildAndPushContainers.js` uses for the whole build/push flow — a major bump here needs real testing against `test:containers` (which already exercises build/push end-to-end) before merging, since dockerode's v5 changelog should be checked for breaking API changes to `buildImage`/`getImage`/`push`. **Target: `5.0.1`** (its actual latest, not an intermediate 4.x — there isn't a patched 4.x for this CVE per the audit's `fixAvailable`).
- **`argon2`** (`^0.30.3`, resolved `0.30.3`, latest `0.45.1`, `isSemVerMajor: true`): high-severity, via `@mapbox/node-pre-gyp`'s vulnerable `tar` dependency (used for downloading argon2's native binary at install time — an install-time supply-chain concern, not a runtime one). `shared/secrets.js` uses this for secret-value hashing; a major bump needs the existing `tests/shared/secrets.test.js` (`mergeSecretEnvVars` tests already cover the hash-compare path) re-run, plus a check that argon2's native-binding install still works cleanly on whatever Node versions the CI matrix ends up covering (see M4). **Target: `0.45.1`** (its actual latest — jumping to an intermediate 0.3x/0.4x release just adds a second migration later for no benefit).

**Fix:** each as its own PR (`npm install dockerode@latest` / `npm install argon2@latest`), verified against the relevant live suite (`test:containers` / `test:shared` + `test:functions`, since functions also use secrets) before merging, since both are semver-major and could carry breaking API changes. Landing on an intermediate version instead of the true latest just defers the same migration work to a future PR — go straight to latest once you're already paying for compatibility testing.

## M4. Node 18.x is end-of-life in the CI matrix — **Resolved.** CI matrix (`.github/workflows/test.yml`) tests 20.x/22.x only; `engines.node` is `>=20.20.2`.

**File:** `.github/workflows/test.yml:38` — `node-version: ["18.x", "20.x"]`

Node 18 reached end-of-life on 2025-04-30 (no more security patches from upstream Node.js). Testing against it still gives no real compatibility signal for users beyond "did the syntax happen to still parse" and costs double the CI time for every push/PR. `package.json` has no `engines` field at all currently, so there's no enforced floor on which Node version this plugin claims to support — worth adding one that matches whatever the CI matrix ends up being.

**Fix:** drop `18.x` from the matrix, add `22.x` (current LTS) alongside `20.x`, and add an `engines.node` field to `package.json` reflecting the supported range.

## M5. Callback-style `fs.readFile` in `uploadCode.js`, with a latent double-settle bug — **Resolved.** `deploy/lib/uploadCode.ts` uses `fs.promises.readFile(archivePath)` — no manual Promise wrapper, the double-settle shape is structurally gone.

**File:** `deploy/lib/uploadCode.js:53-58`

```js
return new Promise((resolve, reject) => {
  fs.readFile(archivePath, (err, data) => {
    if (err) reject(err);
    resolve(data);
  });
}).then((data) => axios({ ... }));
```

This hand-wraps the old Node callback-style `fs.readFile` in a `Promise` executor — `fs.promises.readFile` (or `require("fs/promises")`) has existed since Node 10 and makes this whole wrapper unnecessary:

```js
return fs.promises.readFile(archivePath).then((data) => axios({ ... }));
```

Worth calling out beyond just style: the current code has a latent bug the modernization incidentally fixes. `if (err) reject(err); resolve(data);` is missing an `else`/`return` — on a read error, **both** `reject(err)` and `resolve(data)` (with `data` as `undefined`) get called on the same promise. The first settlement (the `reject`) wins per Promise spec, so this doesn't currently misbehave observably, but it's exactly the kind of double-settle pattern that silently breaks the moment someone reorders these two lines. Switching to `fs.promises.readFile` removes the possibility entirely, not just the current instance of it.

**Fix:** replace with `fs.promises.readFile(archivePath)`, drop the manual `Promise` wrapper.

## M6. Dev tooling — bump to latest across the board (lower priority) — **Resolved.** A full dependency-currency pass (2026-08-27) confirmed every dependency in `package.json` is at its absolute npm latest except two deliberate holds (`typescript` and `@babel/preset-env`, both blocked by peer-dependency/engine constraints — see `CLAUDE.md`'s Conventions section and `shared/api/sdkClient.ts` for the `undici` pin, which is its own deliberate hold for a different reason). `rewire` is gone from `package.json` entirely.

`npm outdated` shows every dev dependency has a newer release available. None of these affect runtime/published behavior — dev-only, but staying current here is what keeps the _next_ update small instead of compounding into another multi-major jump like M1/M3. Target latest for all of them, each as its own isolated PR so a reviewer can trust each diff is purely mechanical:

| Package                    | Current  | Latest   | Note                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint` (+ `@eslint/js`)  | `9.27.0` | `10.9.1` | Flat-config format (already in use here via `eslint.config.mjs`) carries forward; check the v10 migration guide for rule default changes before bumping.                                                                                                                                                                                                                                 |
| `prettier`                 | `2.8.8`  | `3.9.6`  | Reformats the whole repo in one shot (different default `arrowParens`/import-handling heuristics) — do this as its own "chore: bump prettier to 3.x + reformat" commit with zero other changes mixed in.                                                                                                                                                                                 |
| `jest` (+ `@jest/globals`) | `29.7.0` | `30.4.x` | Check the v30 migration guide for changed default `testEnvironment`/timer behavior before bumping, given how much of the newer test suite here (M-adjacent, see the fixing-plan tests added throughout this repo) leans on `jest.useFakeTimers()`.                                                                                                                                       |
| `fs-extra`                 | `11.3.0` | `11.4.0` | Patch-level, no migration concerns — bump freely, can bundle with any other change.                                                                                                                                                                                                                                                                                                      |
| `rewire`                   | `6.0.0`  | `9.0.1`  | Only used by `tests/deploy/buildAndPushContainers.test.js`. Worth checking whether a 9.x `rewire` changes its `__get__`/module-patching behavior before bumping — and worth reconsidering whether `rewire` should be kept at all, since it's already the specific thing blocking a `bun test` migration (see M7); if that migration happens, `rewire` gets removed rather than upgraded. |

Not urgent — flagging for awareness and giving concrete targets, not proposing these jump the queue ahead of the correctness-focused passes.

## M7. Bun as a dev-tooling replacement — what's a real swap vs. what isn't

**Hard constraint first, since it bounds everything else here:** this package is a _Serverless Framework plugin_ — `osls`/`serverless deploy` loads it as a CommonJS module into the CLI's own Node.js process. The plugin doesn't get to choose its own runtime; end users run it under whatever Node version their installed Serverless CLI uses. That means **no Bun-only runtime API (`Bun.file`, `Bun.spawn`, `Bun.serve`, Bun's native `fetch`, etc.) can be used in production source** (`provider/`, `deploy/`, `shared/`, `invoke/`, `jwt/`, `logs/`, `info/`, `remove/`, `index.js`) — doing so would break the plugin for every user, since their CLI process is Node, not Bun. Everything below is scoped to this repo's _own dev tooling_ (how the maintainers install deps, run tests, lint, format), which is a free choice independent of what runtime consumers' CLI runs under.

Checked directly against this repo (not assumed) with Bun 1.3.14 installed locally, originally 2026-08-26 against the plain-JS codebase, **re-checked 2026-08-26 after the codebase became TypeScript** (`feature/typescript-migration`, merged to `v2llm`) — findings below are current as of the re-check; superseded findings are struck through in spirit, not text, so the history of what changed is visible.

| Tool                      | Bun replacement                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install` / `npm ci`  | `bun install`                            | **Done, 2026-08-26 (`chore/bun-migration` branch).** `bun.lock` is now the committed lockfile (`package-lock.json` removed); `bun install` resolves the same tree and correctly runs the `prepare` script (`bun run build` → `tsc`), producing a working `dist/`. CI (`.github/workflows/test.yml`) now uses `oven-sh/setup-bun` + `bun install --frozen-lockfile` for install and `bun run <script>` for every script invocation, including `osls`'s global install (`bun install -g osls@3.51.0` — verified the resulting `serverless`/`sls` binaries run correctly). The Node version matrix (20.x/22.x) is unchanged and still required — Bun here is only the package manager/script runner, the test suites themselves still execute under Node via `jest` (see the row below). `argon2`'s native binding still works post-install. Bun blocks 3 transitive postinstall scripts by default (`protobufjs`, `es5-ext`, `unrs-resolver` — none of them this repo's own direct dependencies, none required for anything this plugin actually uses) — listed via `bun pm untrusted`, harmless here. Two transitive dependencies (`ssh2`, `cpu-features`) needed a `bun patch` fix to avoid crashing Bun outright — see the row below and the CLAUDE.md Conventions entry for the full explanation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run <script>`        | `bun run <script>` / bare `bun <script>` | **Clean swap.** No changes needed to `package.json`'s `scripts` block — Bun executes them as-is, including the newer `typecheck`/`build`/`prepare` scripts added by the TS migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm audit`               | `bun pm scan`                            | **Available, not yet checked for parity.** Bun 1.3.14 has `bun pm scan` ("scan all packages in lockfile for security vulnerabilities") as a built-in equivalent — confirmed the subcommand exists via `bun pm --help`, but didn't compare its output/advisory-database coverage against `npm audit` for this repo's tree, so treat as a candidate to evaluate, not a confirmed drop-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jest` (`npm run test:*`) | `bun test`                               | **Not a drop-in — every load-time blocker is now resolved; what remains is `bun:test`'s own Jest-compatibility gaps.** (1) **Resolved**: the `rewire` blocker is gone — eliminated from the test suite entirely during the TS migration. (2) **Resolved** (Pass M-5b, merged): `@jest/globals` imports dropped repo-wide in favor of Jest's own injected globals; `eslint.config.mjs` declares the Jest globals directly for `tests/**/*.js`. (3) **Resolved 2026-08-26** (`chore/bun-migration` branch): every remaining `export =` file converted — single-class/value files (the plugin/lib entry points) kept `export =` but switched their own imports to `import X = require("Y")`; object-mixin files (all of `shared/api/*` and friends) dropped `export =` for plain named exports. (4) **Resolved 2026-08-26**: `dockerode` → `docker-modem` → `ssh2`'s native `sshcrypto.node` NAPI addon (and `ssh2`'s own `cpu-features` native dependency) were **crashing the entire Bun process** (`Illegal instruction`, `panic(main thread): unsupported uv function: uv_version_string` — [oven-sh/bun#18546](https://github.com/oven-sh/bun/issues/18546)) the moment anything imported `index.ts` (which pulls in the deploy/container-build chain eagerly). Fixed via two `bun patch` patches (`patches/ssh2@1.17.0.patch`, `patches/cpu-features@0.0.10.patch`, tracked in `package.json`'s `patchedDependencies`) that skip each package's native `require()` when `typeof Bun !== 'undefined'`, letting each package's own pre-existing pure-JS fallback take over — no behavior change under Node. Also fixed in the same pass: `info/lib/display.ts`'s `import yaml from "js-yaml"` failed under Bun's stricter ESM-default-export resolution (`js-yaml`'s `.mjs` build has no default export) — changed to `import yaml = require("js-yaml")`, consistent with this repo's own `export =`-file import convention. Verified end-to-end: a `bun test` smoke run that imports `index.ts` now passes cleanly, no crash, no error. (5) **Still open, and out of this repo's control to fully close**: `bun:test`'s Jest-compatibility shim is missing at least one API `tests/shared` uses, `jest.advanceTimersByTimeAsync` — and the one test that hits it doesn't just fail, `bun test tests/shared` **hangs indefinitely** afterward (confirmed by isolating that single test file: it alone reproduces the hang). This blocks a full `jest`→`bun test` swap for now; the package-manager swap (below) is unaffected and done. |
| `eslint`                  | —                                        | **No Bun equivalent.** Bun ships no linter; keep ESLint regardless of what else moves to Bun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `prettier`                | —                                        | **No Bun equivalent.** Confirmed via `bun --help` — no `fmt`/`format` subcommand exists in 1.3.14. Keep Prettier regardless of what else moves to Bun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bundler / compiler        | `bun build`                              | **Stale finding, now superseded — this repo has a real build step.** The original check (pre-TS) noted "no build step, not applicable"; the TypeScript migration added one (`tsc` → `dist/`). Whether `bun build` (or Bun's own TS-to-JS transform) could replace `tsc` for this specific compile — a plain CJS-output TS→JS compile, no bundling needed — has **not** been investigated; flagging as a gap in this doc rather than guessing either way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Why `bun test` specifically can't just replace `jest` here

- **`@jest/globals` was deliberately rejected, not merely unsupported — now fixed.** `bun test` ships its own built-in test runner with a Jest-compatible API (`describe`/`it`/`expect`/...) auto-injected as globals into every test file, specifically so most Jest test suites run unmodified. But `@jest/globals` as a real npm package is wired into Jest's own test environment (its module registry, `jest-circus`/`jest-jasmine2` runner internals) — none of which exists inside `bun test`'s process, so Bun's module resolver explicitly refused the import outright. Pass M-5b (below) removes it repo-wide, which independently verified SOTA Bun+TypeScript practice confirms is also just the idiomatic shape for real Bun projects (they import from `"bun:test"` or rely on ambient globals with a `@types/bun`-style declaration, never `@jest/globals`) — this wasn't a Bun-specific workaround, it was already the more correct convention.
- **`export =` + `import` doesn't transpile the way you'd expect under Bun — resolved 2026-08-26.** TypeScript's `export =` construct compiles to `module.exports = ...`, which Bun's transpiler detects and marks the file "CommonJS" — that detection then makes it reject any ES `import` statement in the same file (even a purely-relative one), insisting on `require()` instead. This is a **documented, general Bun constraint** (mixing `import`/`export` with any CJS-marking construct fails), not specific to this repo. Fixed on `chore/bun-migration`: **not** by uniformly dropping `export =` for `export default` — a controlled `tsc` experiment showed `export = Foo` compiles to bare `module.exports = Foo`, while `export default Bar` compiles to a wrapped, `__esModule`-marked `exports.default = Bar` — a real behavioral difference that would have broken every real Serverless Framework consumer's `require("serverless-scaleway-functions")` for the plugin/lib entry-point files. Instead: files exporting a single class/value kept `export =` and switched their own imports to `import X = require("Y")` (compiles to a plain CJS `require()`, no ES import syntax, so it doesn't trip Bun's check, while still giving real type inference unlike a bare untyped `require()`); files exporting an object of mixin methods dropped `export =` for plain named exports, since `Object.assign`-based mixing only needs enumerable named exports. See the CLAUDE.md "Export/import style" convention entry for the full pattern.
- **`rewire` used to depend on a Node internal Bun doesn't provide** (moot — see the table above; kept here only for the historical record). `rewire` worked by monkey-patching `Module.prototype.load`/`_compile`, a real, patchable object under Node but not under Bun's natively-implemented `require()` — hence the `TypeError: targetModule.load is not a function` seen in the original check.
- **A native NAPI module used to crash the whole Bun process — fixed 2026-08-26 via `bun patch`.** `dockerode@5.0.1` → `docker-modem@5.0.7` → `ssh2@1.17.0` ships a native addon (`sshcrypto.node`) for SSH-based Docker daemon connections, and `ssh2` also optionally depends on `cpu-features`'s own native addon. Loading either under Bun 1.3.14 hits an unimplemented libuv shim (`uv_version_string`) and **panics the process** (`Illegal instruction`, core dump) rather than throwing a catchable error — confirmed via `bun test` against a one-line file that just imports `index.ts`, and confirmed that even the existing `try { require(...) } catch {}` wrapper both packages already have (for platforms with no prebuilt binary) can't save it, since the panic happens inside Bun's native-module loader before control ever returns to JS. Not something a `require()`/`import` change in _this_ repo's own code could route around, since `dockerode` is a real, needed dependency and its own chain pulls these in regardless of how this repo imports it. **Fix:** two `bun patch` patches (`patches/ssh2@1.17.0.patch`, `patches/cpu-features@0.0.10.patch`, tracked via `package.json`'s `patchedDependencies` so they reapply on every `bun install`) that guard each package's native `require()` behind `typeof Bun === 'undefined'` — under Bun, the require is skipped entirely and each package's own already-existing pure-JS fallback takes over (verified: no behavior change under Node, where the guard is always false and the native binding loads exactly as before).
- **`js-yaml`'s default import also failed under Bun's stricter ESM resolution — fixed in the same pass.** `info/lib/display.ts`'s `import yaml from "js-yaml"` threw `SyntaxError: Missing 'default' export in module '.../js-yaml/dist/js-yaml.mjs'` — Bun resolves to `js-yaml`'s `.mjs` build, which only has named exports, unlike Node's `require()`-based CJS resolution. Fixed by switching to `import yaml = require("js-yaml")`, consistent with this repo's own `export =`-file import convention (see the CLAUDE.md entry) — compiles to a plain `require()`, so it resolves to the CJS build under both Node and Bun.

Net effect: with M-5b, the `export =` fix, and both native-module patches landed, a `bun test` smoke run that imports `index.ts` (pulling in the full deploy/container chain) now runs clean — no crash, no error. What's left is `bun:test`'s own Jest-compatibility shim: it's missing at least one API this repo's tests use (`jest.advanceTimersByTimeAsync`), and the one test that hits it doesn't just fail — `bun test tests/shared` **hangs indefinitely** afterward (confirmed by isolating that one test file, which alone reproduces the hang). That gap is `bun:test`'s own Jest-API coverage, not a repo-side blocker, but it's still enough to keep the full `jest`→`bun test` swap parked for now.

**Fix, if pursued:** package-manager swap (`bun install`, `bun.lock`, CI's `oven-sh/setup-bun`) is **done** — see the row above. The test-runner swap (`bun test` replacing `jest`) should stay parked until `bun:test`'s Jest-compatibility shim covers the fake-timer APIs this repo's tests rely on (or those tests are rewritten to avoid them) — re-check against newer Bun releases periodically rather than working around it here.

## M8. Live integration suites: a narrow race when run concurrently on one machine (optional) — **Not re-verified, 2026-08-27.** `tests/utils/misc/index.ts` still shells out via `shared/child-process` (file extension changed `.js`→`.ts` in the TS migration, mechanism not confirmed unchanged) — likely still accurate but wasn't re-checked in this pass; treat as open until someone does.

**File:** `tests/utils/misc/index.js`'s `createTestService()` — `execSync(\`npm link --force ${repoDir}\`)`.

Not a bug in the suites' design — each live suite (`test:functions`, `test:containers`, `test:triggers`, etc.) already isolates itself via `createProject()`, creating a fresh Scaleway sub-project per run specifically so concurrent suites don't collide on shared account resources. That's exactly what lets CI's own workflow (`.github/workflows/test.yml`) run this whole suite matrix as parallel jobs today, and it works there because each matrix job is a separate GitHub Actions runner — its own filesystem, its own global npm prefix, nothing shared.

Running multiple suites concurrently **on one machine** (as opposed to CI's separate-runner parallelism) reintroduces one narrow risk that CI's isolation sidesteps: `npm link <folder>` doesn't just create a local symlink — per `npm help link`, it also registers/overwrites a symlink in the **global** npm prefix (`npm root -g`, e.g. `/usr/local/lib/node_modules/serverless-scaleway-functions`), shared machine-wide. If several suites run `createTestService()` at the same time from their own temp directories, they all race to (re)write that same global symlink entry. Every suite points it at the same target (`repoDir`), so the end state is harmless either way, but the write itself (`--force` implies remove-then-recreate) isn't guaranteed atomic across processes — a narrow window exists where the global symlink could look transiently missing to whichever suite's own module resolution lands in it at the wrong moment.

**Fix, if pursued:** replace the shared global-symlink approach with something inherently race-free per invocation — e.g. `npm install --no-save <repoDir>` (a local install/copy into each temp dir's own `node_modules`, no global state touched) instead of `npm link --force`, or serialize just the link step (a simple mutex/lockfile around that one `execSync` call) while leaving everything else concurrent. Low priority: only matters when deliberately running multiple live suites side-by-side on a single machine outside of CI's normal per-runner isolation, and production credentials (unlike this investigation's scoped-down sandbox key) already have the project-creation rights the isolation model assumes.

## M9. Biome as a potential ESLint + Prettier replacement — status: not confirmed

**This is not a decided plan item.** Researched 2026-08-26 at the user's request, with explicit open questions still unanswered; do not treat anything below as agreed work.

**What was checked:** `@biomejs/biome@2.5.10` on npm (current, well past 1.0, frequently published). It ships 526 built-in rules across JS/TS/CSS/JSON/GraphQL/HTML and understands TypeScript natively — no `typescript-eslint`-equivalent plugin needed. Checked directly against this repo's actual `eslint.config.mjs` (33 lines: `js/recommended` for `.js`, `typescript-eslint`'s `recommended` for `.ts` as of the in-progress TypeScript migration, plus one repo-specific override — `no-unused-vars: off` for `tests/**/*.test.js`, to silence false positives on Jest's implicit globals). Biome's `overrides[].includes` + `overrides[].linter.rules` config shape can express that same override directly. One real gap: Biome's TypeScript linting is syntactic only, not type-aware (no `tsc`-backed rules the way `typescript-eslint`'s type-checked rulesets are) — doesn't bite here specifically, since this repo's config only uses the non-type-checked `tseslint.configs.recommended` variant.

**Reformat risk:** real, not hypothetical. Biome's formatter _defaults_ to tab indentation; this repo's Prettier output is space-indented, so adopting Biome with raw defaults would reformat the entire tree in one diff. Biome ships a real `biome migrate prettier` command that ports an existing Prettier config's settings (including indentation style) into `biome.json` — using it deliberately should avoid the mass-reformat; skipping it would not.

**CI:** a first-party `biomejs/setup-biome` GitHub Action plus a single `biome ci .` command could replace the current two-step gate (`npx prettier --check .` + the separate eslint job).

**User's answer so far (2026-08-26):** not confirmed we'll actually migrate — this stays a researched option, not a plan. **If** it does happen: migrate both ESLint and Prettier together (not just one), and keep space indentation (run `biome migrate prettier` first rather than adopting Biome's tab default).

**Still open:**

- What's the actual motivation, given `eslint.config.mjs` is only 33 lines with one custom rule — migration effort is cheap either way, so is this about lint/format speed, collapsing two tools into one, or something else?
- Timing relative to the in-progress TypeScript migration (`feature/typescript-migration` branch) — finish that first, or fold in together?

---

## M10. SDK client investigation notes (accessKey, socket-reuse race, undici version pin) — done, 2026-08-26/27

Three separate incident write-ups from building `shared/api/sdkClient.ts` during the `@scaleway/sdk-*` migration, moved here from inline code comments (which now just state the load-bearing rule and point back to this section) so the source file stays readable.

### accessKey isn't required, only well-formed

`@scaleway/sdk-client`'s client-side auth guard (`hasAuthenticationSecrets`/`assertValidAuthenticationSecrets`) requires a well-formed `accessKey` (`^SCW[A-Z0-9]{17}$`) before it will even attach the authentication interceptor to outgoing requests — but that interceptor (`authenticateWithSecrets`) only ever puts `secretKey` on the wire, via the `X-Auth-Token` header; `accessKey` is never transmitted anywhere. Verified directly against the real API (2026-08-26): a well-formed-but-unregistered accessKey plus a real secretKey authenticates successfully, identically to a real accessKey. This repo's entire credential model (`provider/scalewayProvider.ts`) has only ever collected a secret key — there is no user-facing access-key concept, and none is needed. `sdkClient.ts`'s `PLACEHOLDER_ACCESS_KEY` constant (`` `SCW${"0".repeat(17)}` ``) exists purely to satisfy the SDK's client-side format check.

### `SocketError: other side closed` — a socket-reuse race, not a client bug

This repo hit an intermittent `SocketError: other side closed` against the real API during live-suite validation, occasionally and identically through both the new SDK's fetch transport and the separate axios-based paths (`jwt.ts`/`logs.ts`/`uploadCode.ts`) that predate the SDK migration — ruling out either HTTP client implementation as the cause.

Root cause, confirmed via web research matching this repo's symptoms exactly against [nodejs/undici#5450](https://github.com/nodejs/undici/issues/5450), [#3300](https://github.com/nodejs/undici/issues/3300), and [#2400](https://github.com/nodejs/undici/issues/2400): undici's connection pool can pull a pooled keep-alive socket for reuse in the same instant an intermediary (a NAT, proxy, or load balancer sitting between this plugin and the Scaleway API) closes it for being idle. This is a genuine **race**, not a fixed timeout misconfiguration — tuning the client's own `keepAliveTimeout` to sit below the intermediary's idle timeout only narrows that race window, it can't close it, since Scaleway doesn't publish (and could change) whatever that intermediary's timeout actually is.

Two mitigations were shipped, in this order:

1. **Retry wrapper** (`scalewayFetch` in `sdkClient.ts`) — retries only idempotent methods (GET/HEAD/OPTIONS/PUT/DELETE) on a genuine network-level failure (`fetch()` throwing a `TypeError`, never an HTTP error response). POST/PATCH (create/update calls) intentionally stay non-retried, since a network failure doesn't reveal whether the server already processed the request — retrying could create a duplicate resource.
2. **Non-persistent connections** (the actual fix for the race, not just a mitigation of its symptom) — since this is a deploy CLI making occasional, sequential requests rather than a high-throughput service, there's no meaningful cost to giving up connection reuse entirely. A dedicated `undici.Agent` with `keepAliveTimeout`/`keepAliveMaxTimeout` set to 1ms evicts a socket from the pool essentially the instant it goes idle — functionally equivalent to `Connection: close` (which `fetch()` itself refuses to let a caller set directly — it's on the Fetch spec's forbidden-header list). The retry wrapper stays as defense-in-depth for a genuine one-off network blip unrelated to socket reuse.

### `undici` (the npm package) drifts from the undici Node vendors internally — pin to 6.x

Adding `undici` as a direct dependency (needed to get the `Agent` class for the fix above) surfaced a real, easy-to-miss gotcha: the standalone npm `undici` package and whatever undici Node vendors internally for its own built-in `fetch` can be different versions, and a newer external `Agent`'s handler interface isn't necessarily one Node's internal fetch dispatch understands.

Verified directly (2026-08-26, Node 22.22.1): `undici@8.10.0`'s `Agent`, passed as `fetch()`'s `dispatcher` option, **type-checks fine** but throws `InvalidArgumentError: invalid onRequestStart method` at runtime on the very first real request. `undici@6.28.0` works cleanly — confirmed with 5 live sequential requests against the real API. `package.json` pins `undici` to `^6.28.0` for this reason; **do not bump past the 6.x line without re-verifying with a real request against the live API, not just a type check** — the mismatch above passed `tsc` without any error.

---

## Modernization fixing plan (priority order)

**Pass M-1 — Free security fixes (no code changes):**

- M2 Update `axios` to `1.20.0` and `js-yaml` to `4.3.1` — both within their existing semver ranges.

**Pass M-2 — Bluebird removal (do the mechanical parts first):**

- M1(c) Replace `BbPromise.resolve()`/`BbPromise.reject()` with native equivalents.
- M1(b) Replace the two `BbPromise.map()` call sites (sequential loop for the `concurrency: 1` case, a small bounded-concurrency helper for the `concurrency: 5` case).
- M1(a) Migrate the 13 `.bind(this)` files to async/await, file by file, verified against the relevant test suite per file. Remove `bluebird` from `package.json` once all 16 files are clear.

**Pass M-3 — Higher-effort dependency bumps (go straight to each package's latest):**

- M3 `dockerode` → `5.0.1` and `argon2` → `0.45.1`, each verified against their respective live test suites.
- M2 (follow-up) `js-yaml` → `5.4.0` as its own deliberate bump beyond the M-1 CVE fix, checked against its migration guide (single call site: `provider/scalewayProvider.js`).
- M4 Drop Node 18.x from the CI matrix, add Node 22.x, add an `engines.node` field.

**Pass M-4 — Small cleanups and dev-tooling bumps (also to latest):**

- M5 Replace the hand-wrapped `fs.readFile` in `uploadCode.js` with `fs.promises.readFile`.
- M6 Dev tooling bumps, each as its own isolated PR: `eslint`→`10.9.1`, `prettier`→`3.9.6` (reformats the whole repo — zero other changes in that commit), `jest`/`@jest/globals`→`30.4.x`, `fs-extra`→`11.4.0` (trivial, can bundle), `rewire`→`9.0.1` (or drop entirely if Pass M-5's test-runner migration happens first).

**Pass M-5 — Bun adoption for dev tooling (optional, sequence last):**

- M7 Package-manager swap (`bun install` + `bun.lock`, update CI's setup step) — **done, 2026-08-26 (`chore/bun-migration`).** `bun.lock` committed, `package-lock.json` removed, CI's `.github/workflows/test.yml` uses `oven-sh/setup-bun` and `bun run <script>` throughout, `osls`'s global install verified working under Bun.
- M7 Test-runner swap (`bun test`) — **partially unblocked, still parked.** The `export =`/`import` conflict that used to gate this is resolved (2026-08-26, `chore/bun-migration`: single-value-export files switched their own imports to `import X = require("Y")`; object-mixin files dropped `export =` for named exports — see the table above for why a uniform `export default` swap was rejected). The deeper blocker found underneath it — `dockerode`'s `ssh2`/`cpu-features` native NAPI dependencies panicking the whole Bun process on load ([oven-sh/bun#18546](https://github.com/oven-sh/bun/issues/18546)) — is also now fixed, via two `bun patch` patches that skip the native `require()` under Bun (see the table above). What's left: `bun:test`'s own Jest-compatibility shim is missing `jest.advanceTimersByTimeAsync`, and the test that hits it hangs `bun test` indefinitely rather than just failing — not a repo-side issue, but still enough to keep this swap parked until `bun:test`'s fake-timer API coverage improves (or the affected tests are rewritten to avoid it).

**Pass M-5b — Drop `@jest/globals` imports, on Jest itself — done (`fix/jest-globals-implicit` branch, 2026-08-26, not yet merged as of this writing):**

- Removed the explicit `require("@jest/globals")` destructuring from all 41 test files that had it; relies on Jest's own injected globals instead (Jest injects `describe`/`it`/`expect`/etc. into global scope by default — `injectGlobals` was never set to `false` in this repo's Jest config, so the import never did anything at runtime, existing only to satisfy ESLint's `no-undef` rule). Where a binding was renamed on import (`expect: jestExpect`, `jest: requiredJest`), kept a same-named `const alias = global;` line rather than touching call sites throughout the file.
- `eslint.config.mjs` now declares `describe`/`it`/`test`/`expect`/`beforeAll`/`beforeEach`/`afterAll`/`afterEach` as read-only globals scoped to `tests/**/*.js`, so `no-undef` stays satisfied without the import.
- Real drawback, paid deliberately: the explicit `@jest/globals` import is also what gives IDEs/`ts-jest`/any future `.ts` test file real _type_ information for `describe`/`it`/`expect` without needing an ambient `@types/jest`-style global declaration — dropping it trades that away for less boilerplate. Doesn't bite today since all test files are still `.js` (unchecked, per `tsconfig.json`'s `checkJs: false`), but would need revisiting if tests are ever converted to `.ts`.
- Verified: all 281 offline tests pass, typecheck/build/lint/format clean; spot-checked `bun test tests/shared/setUpDeployment.test.js` now runs clean where it previously failed outright on the `@jest/globals` import.
- Unblocks nothing on the Bun path by itself (the `export =`/`import` blocker is independent and would still need its own fix), but is a real simplification either way, and was requested on its own merits — not contingent on a Bun decision ever being made.

**Pass M-6 — Local concurrent-test-run hardening (optional, only matters outside CI):**

- M8 Replace `npm link --force` in `createTestService()` with a race-free alternative (e.g. `npm install --no-save`) or serialize just that step, so multiple live suites can safely run side-by-side on one machine instead of only across CI's separate runners.
