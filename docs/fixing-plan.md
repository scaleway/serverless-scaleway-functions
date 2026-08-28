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

| #   | Area         | One-liner                                                                                                                                                                                                           |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Runtime dep  | `bluebird` (last released 2019) is used only for `.bind(this)` promise-chaining and two `.map(..., {concurrency})` calls — both have clean native replacements                                                      |
| M2  | Security     | `axios` (target latest `1.20.0`) and `js-yaml` (target latest patched 4.x `4.3.1` now, true latest `5.4.0` as a deliberate separate bump) have high-severity CVEs                                                   |
| M3  | Security     | `dockerode` (target latest `5.0.1`) and `argon2` (target latest `0.45.1`) have vulnerabilities needing a major-version bump — go straight to latest, not an intermediate version                                    |
| M4  | CI           | Test matrix still runs on Node 18.x, which reached end-of-life in April 2025                                                                                                                                        |
| M5  | Code quality | `uploadCode.js` hand-wraps the old callback-style `fs.readFile` instead of using `fs/promises`, and the hand-wrapping has a latent double-settle bug                                                                |
| M6  | Tooling      | Every dev dependency has a newer release; targets: `eslint`→`10.9.1`, `prettier`→`3.9.6`, `jest`→`30.4.x`, `fs-extra`→`11.4.0` (trivial), `rewire`→`9.0.1` (or drop it, see M7)                                     |
| M7  | Tooling      | Bun can cleanly replace `npm install`/`npm run` (verified); replacing `jest` needs a real migration (verified `@jest/globals` and `rewire` both break under Bun) — no Bun equivalent exists for `eslint`/`prettier` |
| M8  | Test infra   | Running multiple live suites concurrently on one machine (not CI, which uses separate runners) has a narrow race in `npm link --force`'s shared global symlink — optional, low priority                             |

---

## M1. Removing Bluebird

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

## M2. Dependency CVEs fixable within the existing semver range — and how far past that to actually go

`npm audit --omit=dev` reports 22 vulnerabilities in the production dependency tree (2 low, 6 moderate, 10 high, 4 critical). Most of the critical/high ones (`tar`, `decompress`, `protobufjs`, `form-data`, `@grpc/grpc-js`, `lodash`, `minimatch`, `brace-expansion`) are _transitive_ dependencies of `@serverless/utils` (already at its latest release, `6.15.0`) or of `dockerode`'s own dependency tree, pulled in for parts of those packages this plugin doesn't use (this plugin only imports `@serverless/utils/log`). Not independently actionable without upstream releases from those packages.

Two direct dependencies have high-severity CVEs, and for both the target should be **the actual latest release**, not just the nearest patched version — going further costs nothing extra here since neither crosses a major version to get there:

- **`axios`** (`^1.4.0` in `package.json`, resolved to `1.9.0`, vulnerable range `1.0.0 - 1.17.0`, CVE-fixed version and the package's true latest are the same release, `1.20.0`): a long list of CVEs (SSRF via `NO_PROXY` bypass, prototype-pollution-based request/response tampering, ReDoS, several DoS vectors) fixed across 1.18–1.20. Since `getApiManager()` (`shared/api/utils.js`) is the single chokepoint every API call goes through, this is worth prioritizing — it's the plugin's entire network surface. **Target: `1.20.0`** (bump `package.json`'s range to `^1.20.0` so the lockfile can't silently drift back down).
- **`js-yaml`**: two separate decisions here, not one. The CVE fix (prototype pollution and quadratic-complexity DoS via YAML merge-key handling) lands in `4.3.1`, still inside the `^4.1.0` range `package.json` already declares — that part is free, no code changes. The package's true latest, `5.4.0`, is a separate major-version jump beyond the CVE fix, with its own breaking-change surface to check (js-yaml's own changelog before committing to it) — treat that as its own decision, not bundled into the CVE fix. **Target now: `4.3.1`** (free); **target later, deliberately: `5.4.0`** (its own PR, see below).

**Fix (now):** bump `axios` to `1.20.0` and `js-yaml` to `4.3.1` in `package.json`/`package-lock.json`, re-run the full test suite. No source changes expected for either.

**Fix (separate, deliberate follow-up):** evaluate `js-yaml` 5.x on its own — it's used in exactly one place (`provider/scalewayProvider.js`, parsing `~/.config/scw/config.yaml`), so the blast radius of checking its migration guide is small.

## M3. Dependency CVEs needing a major version bump — go to latest, not just "patched enough"

- **`dockerode`** (`^4.0.6`, resolved `4.0.6`, latest `5.0.1`, `isSemVerMajor: true`): moderate-severity, via a vulnerable `uuid` sub-dependency. `dockerode` is the library `deploy/lib/buildAndPushContainers.js` uses for the whole build/push flow — a major bump here needs real testing against `test:containers` (which already exercises build/push end-to-end) before merging, since dockerode's v5 changelog should be checked for breaking API changes to `buildImage`/`getImage`/`push`. **Target: `5.0.1`** (its actual latest, not an intermediate 4.x — there isn't a patched 4.x for this CVE per the audit's `fixAvailable`).
- **`argon2`** (`^0.30.3`, resolved `0.30.3`, latest `0.45.1`, `isSemVerMajor: true`): high-severity, via `@mapbox/node-pre-gyp`'s vulnerable `tar` dependency (used for downloading argon2's native binary at install time — an install-time supply-chain concern, not a runtime one). `shared/secrets.js` uses this for secret-value hashing; a major bump needs the existing `tests/shared/secrets.test.js` (`mergeSecretEnvVars` tests already cover the hash-compare path) re-run, plus a check that argon2's native-binding install still works cleanly on whatever Node versions the CI matrix ends up covering (see M4). **Target: `0.45.1`** (its actual latest — jumping to an intermediate 0.3x/0.4x release just adds a second migration later for no benefit).

**Fix:** each as its own PR (`npm install dockerode@latest` / `npm install argon2@latest`), verified against the relevant live suite (`test:containers` / `test:shared` + `test:functions`, since functions also use secrets) before merging, since both are semver-major and could carry breaking API changes. Landing on an intermediate version instead of the true latest just defers the same migration work to a future PR — go straight to latest once you're already paying for compatibility testing.

## M4. Node 18.x is end-of-life in the CI matrix

**File:** `.github/workflows/test.yml:38` — `node-version: ["18.x", "20.x"]`

Node 18 reached end-of-life on 2025-04-30 (no more security patches from upstream Node.js). Testing against it still gives no real compatibility signal for users beyond "did the syntax happen to still parse" and costs double the CI time for every push/PR. `package.json` has no `engines` field at all currently, so there's no enforced floor on which Node version this plugin claims to support — worth adding one that matches whatever the CI matrix ends up being.

**Fix:** drop `18.x` from the matrix, add `22.x` (current LTS) alongside `20.x`, and add an `engines.node` field to `package.json` reflecting the supported range.

## M5. Callback-style `fs.readFile` in `uploadCode.js`, with a latent double-settle bug

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

## M6. Dev tooling — bump to latest across the board (lower priority)

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

Checked directly against this repo (not assumed) with Bun 1.3.14 installed locally:

| Tool                      | Bun replacement                          | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm install` / `npm ci`  | `bun install`                            | **Clean swap.** Confirmed: `bun install` reads `package-lock.json` directly and auto-migrates it (`[5.01ms] migrated lockfile from package-lock.json`), resolves the same tree correctly. Would move to committing `bun.lock` instead of `package-lock.json` as the source of truth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `npm run <script>`        | `bun run <script>` / bare `bun <script>` | **Clean swap.** No changes needed to `package.json`'s `scripts` block — Bun executes them as-is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm audit`               | `bun pm scan`                            | **Available, not yet checked for parity.** Bun 1.3.14 has `bun pm scan` ("scan all packages in lockfile for security vulnerabilities") as a built-in equivalent — confirmed the subcommand exists via `bun pm --help`, but didn't compare its output/advisory-database coverage against `npm audit` for this repo's tree, so treat as a candidate to evaluate, not a confirmed drop-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jest` (`npm run test:*`) | `bun test`                               | **Not a drop-in — two separate, real blockers, both confirmed directly against this repo's actual test files:** (1) every test file in `tests/` explicitly imports `{ describe, it, expect, ... }` from `@jest/globals` (the project's own established convention, chosen specifically because ESLint doesn't declare those as globals) — `bun test` refuses this outright: `error: Do not import '@jest/globals' outside of the Jest test environment`. (2) `tests/deploy/buildAndPushContainers.test.js` uses `rewire` to reach unexported private functions (`rewire(path).__get__("functionName")`) — confirmed this throws under Bun's module loader: `TypeError: targetModule.load is not a function`, because `rewire` depends on Node's internal `Module.prototype.load`, which Bun's CommonJS implementation doesn't provide. A real migration means rewriting every test file's imports off `@jest/globals` **and** eliminating the one `rewire` usage (either exporting the functions it reaches, or restructuring that test) — not a config flag. This is the same tradeoff already surfaced and deliberately deferred earlier as its own tracked piece of work, separate from everything else in this plan. |
| `eslint`                  | —                                        | **No Bun equivalent.** Bun ships no linter; keep ESLint regardless of what else moves to Bun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `prettier`                | —                                        | **No Bun equivalent.** Confirmed via `bun --help` — no `fmt`/`format` subcommand exists in 1.3.14. Keep Prettier regardless of what else moves to Bun.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bundler                   | `bun build`                              | **Not applicable.** This package intentionally has no build step (published as plain CommonJS source per its own architecture) — introducing one to use `bun build` would be an unrelated, larger architecture change, not a tooling swap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Why `bun test` specifically can't just replace `jest` here

The two blockers in the table above aren't arbitrary compatibility gaps — each comes from a real architectural difference between Bun and Node/Jest, not just a missing feature Bun hasn't gotten around to yet:

- **`@jest/globals` is deliberately rejected, not merely unsupported.** `bun test` ships its own built-in test runner with a Jest-compatible API (`describe`/`it`/`expect`/...) auto-injected as globals into every test file, specifically so most Jest test suites run unmodified. But `@jest/globals` as a real npm package is wired into Jest's own test environment (its module registry, `jest-circus`/`jest-jasmine2` runner internals) — none of which exists inside `bun test`'s process. Rather than silently hand back a mismatched or partially-working shim, Bun's module resolver explicitly refuses the import outright: `error: Do not import '@jest/globals' outside of the Jest test environment`. This is exactly why this repo can't just delete the import and rely on the ambient globals either, without first getting ESLint to stop flagging `describe`/`it`/`expect` as undefined (the reason the explicit import convention exists here in the first place, per the ESLint config).
- **`rewire` depends on a Node internal Bun doesn't provide.** `rewire` works by monkey-patching `Module.prototype.load`/`_compile` before `require()`-ing the target file, so it can inject `__set__`/`__get__` accessors into that module's scope. That trick only works because Node's actual `module` implementation is a real, patchable JS object. Bun implements CommonJS `require()` natively inside its own runtime rather than by reusing Node's `module` internals, so the `Module.prototype.load` method `rewire` expects to patch simply isn't a real function on Bun's module objects — hence the observed `TypeError: targetModule.load is not a function`. This isn't fixable by a config flag or a newer `rewire` version; it needs `tests/deploy/buildAndPushContainers.test.js`'s one `rewire(path).__get__(...)` usage either replaced (export the function under test directly, or restructure the test around the public API) or the whole suite kept on Jest.

Net effect: a `bun test` migration is gated on eliminating both of these at the source (drop `@jest/globals` imports repo-wide in favor of Bun's ambient globals, and remove the one `rewire` call site), not on Bun catching up with a missing feature — which is why M7 treats it as its own dedicated migration effort rather than a config change.

**Fix, if pursued:** package-manager swap (`bun install`, commit `bun.lock`) is low-risk and could be done as its own small PR any time — CI would need `oven-sh/setup-bun` added alongside/instead of `actions/setup-node` in `.github/workflows/test.yml`, and `npm install -g osls` in that workflow would become `bun install -g osls` (verify `osls` itself installs and runs correctly under Bun's global-install path before committing to this). The test-runner swap is materially larger (every test file touched, `rewire` eliminated) and should stay its own dedicated effort, sequenced after the correctness fixes in this plan land — migrating the test suite while the tests are also the regression net for 20+ in-flight bug fixes is the wrong order.

## M8. Live integration suites: a narrow race when run concurrently on one machine (optional)

**File:** `tests/utils/misc/index.js`'s `createTestService()` — `execSync(\`npm link --force ${repoDir}\`)`.

Not a bug in the suites' design — each live suite (`test:functions`, `test:containers`, `test:triggers`, etc.) already isolates itself via `createProject()`, creating a fresh Scaleway sub-project per run specifically so concurrent suites don't collide on shared account resources. That's exactly what lets CI's own workflow (`.github/workflows/test.yml`) run this whole suite matrix as parallel jobs today, and it works there because each matrix job is a separate GitHub Actions runner — its own filesystem, its own global npm prefix, nothing shared.

Running multiple suites concurrently **on one machine** (as opposed to CI's separate-runner parallelism) reintroduces one narrow risk that CI's isolation sidesteps: `npm link <folder>` doesn't just create a local symlink — per `npm help link`, it also registers/overwrites a symlink in the **global** npm prefix (`npm root -g`, e.g. `/usr/local/lib/node_modules/serverless-scaleway-functions`), shared machine-wide. If several suites run `createTestService()` at the same time from their own temp directories, they all race to (re)write that same global symlink entry. Every suite points it at the same target (`repoDir`), so the end state is harmless either way, but the write itself (`--force` implies remove-then-recreate) isn't guaranteed atomic across processes — a narrow window exists where the global symlink could look transiently missing to whichever suite's own module resolution lands in it at the wrong moment.

**Fix, if pursued:** replace the shared global-symlink approach with something inherently race-free per invocation — e.g. `npm install --no-save <repoDir>` (a local install/copy into each temp dir's own `node_modules`, no global state touched) instead of `npm link --force`, or serialize just the link step (a simple mutex/lockfile around that one `execSync` call) while leaving everything else concurrent. Low priority: only matters when deliberately running multiple live suites side-by-side on a single machine outside of CI's normal per-runner isolation, and production credentials (unlike this investigation's scoped-down sandbox key) already have the project-creation rights the isolation model assumes.

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

- M7 Package-manager swap (`bun install` + `bun.lock`, update CI's setup step) — low-risk, can happen any time.
- M7 Test-runner swap (`bun test`) — its own dedicated migration (drop `@jest/globals` imports repo-wide, eliminate the one `rewire` usage) after every other pass in this plan and the main findings plan have landed, so the test suite isn't being rewritten while it's also the regression net for in-flight fixes.

**Pass M-6 — Local concurrent-test-run hardening (optional, only matters outside CI):**

- M8 Replace `npm link --force` in `createTestService()` with a race-free alternative (e.g. `npm install --no-save`) or serialize just that step, so multiple live suites can safely run side-by-side on one machine instead of only across CI's separate runners.
