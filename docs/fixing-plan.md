# Code review findings & fixing plan

Review date: 2026-08-26. Scope: `provider/`, `deploy/`, `remove/`, `invoke/`, `jwt/`, `logs/`, `info/`, `shared/`, `index.js` (all `.js`, excluding `tests/` and `examples/`). Every finding below was confirmed by reading the actual code directly (not inferred); line numbers refer to the current `master` (`c1e902d`).

This is a findings + plan document only — no code has been changed yet.

## Summary

| #   | Severity | Area          | One-liner                                                                                                    |
| --- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Critical | API client    | TLS certificate verification is disabled for every API call                                                  |
| 2   | High     | API client    | `manageError` silently swallows some errors instead of throwing                                              |
| 3   | High     | Triggers      | Trigger delete/create calls aren't awaited — races that likely cause the still-open HTTP 409s                |
| 4   | High     | API client    | List endpoints don't paginate — resources beyond page 1 are invisible                                        |
| 5   | High     | Deploy        | Recent crash fix over-broadened silent failure to all 4xx, causing a _different_ crash downstream            |
| 6   | High     | JWT           | `serverless jwt` issues function JWTs for containers (copy/paste bug)                                        |
| 7   | High     | Provider      | Region from `~/.config/scw/config.yaml` (`default_region`) is silently discarded                             |
| 8   | High     | Provider      | Partial `scwToken`/`scwProject` in `serverless.yml` crashes with an unhelpful `TypeError`                    |
| 9   | Medium   | Deploy        | `.then(cli.log(...))` bug — delete confirmation log fires before deletion is confirmed                       |
| 10  | Medium   | Deploy        | Domain-deployment wait isn't awaited — deploy can "succeed" before domains are ready                         |
| 11  | Medium   | Registry      | Registry namespace listing uses the wrong query param name, breaking project scoping                         |
| 12  | Medium   | Invoke        | `serverless invoke` has no auth header, isn't awaited, and crashes on an unmatched name                      |
| 13  | Medium   | Domains       | `createDomainAndLog` is fire-and-forget; domain failures never fail the deploy                               |
| 14  | Medium   | Containers    | `.dockerignore` contents are never applied — excluded files/secrets can end up in the image                  |
| 15  | Medium   | Validation    | Nothing rejects defining both `functions` and `custom.containers` — confusing crash instead of a clear error |
| 16  | Low      | Cleanup logic | `getElementsToDelete` inner loop is dead code (wrong comparison + non-mutating `slice`)                      |
| 17  | Low      | Robustness    | All polling loops (`wait*`) are unbounded — no timeout/max attempts                                          |
| 18  | Low      | Remove        | `waitNamespaceIsDeleted` discards the real error behind a generic message on any non-404 failure             |
| 19  | Low      | Info          | `serverless info` has no `.catch` on its API calls — unhandled rejection on failure                          |
| 20  | Low      | Code quality  | Dead `if (inspectedImage === undefined) return;` in container build                                          |
| 21  | Low      | Code quality  | Function/container create-update paths are ~80 lines of duplicated, drifting logic                           |
| 22  | Low      | Invoke        | Typo in user-facing error message ("servleress.yml")                                                         |

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
    this.deletePreviousTriggersForApplication(appWithTriggers)
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

**Fix:** preserve `err`/`err.message` in the thrown error instead of replacing it, e.g. `` throw new Error(`An error occurred during namespace deletion: ${err.message}`) ``.

### 19. `serverless info` has no `.catch`

**File:** `info/lib/display.js:9-44`

The `getNamespaceFromList(...).then(...)` chain, and the nested `listContainers(...).then(...)` / `listFunctions(...).then(...)` calls inside it, have no `.catch` anywhere and aren't returned from `displayInfo()`. Any API failure (auth error, 500, network issue) during `serverless info` becomes an unhandled promise rejection rather than the clean error message the `dca4f5b` fix aimed for elsewhere in the codebase.

### 20. Dead code in container build

**File:** `deploy/lib/buildAndPushContainers.js:135-143`

```js
const inspectedImage = await image.inspect().catch(() => {
  throw new Error(
    `Image ${imageName} does not exist: run --verbose to see errors`
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
