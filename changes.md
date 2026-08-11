# Upgrade Plan: TypeScript Migration & Modernization

## Decisions

- Migrate source from CommonJS/JavaScript to TypeScript
- Remove `logs/` command entirely
- Remove `jwt/` command entirely (not just modernize — delete it)
- Keep integration tests as-is (logic unchanged, only require paths updated)
- Node version floor: `>=20`
- Drop `@serverless/utils` dependency
- Add API request retries (via SDK's interceptor framework)
- Adopt `@scaleway/sdk-*` packages (replaces hand-rolled axios API layer)
- Consolidate `SCW_FUNCTION_URL` / `SCW_CONTAINER_URL` into single `SCW_API_URL`
- Husky: deferred (not added in this pass)
- Release automation: deferred
- Osls: keep v3 latest in CI (drop pinning to `3.51.0`)
- Versioning: user will handle manually

---

## Phase 1 — Security & Bug Fixes (standalone, ship first)

| # | File | Fix |
|---|------|-----|
| 1.1 | `shared/api/utils.js:15-17` | Remove `rejectUnauthorized: false`. TLS verification is mandatory; if a custom CA is ever needed, gate it behind an explicit env var (`SCW_INSECURE_TLS`). |
| 1.2 | `shared/singleSource.js:21` | `slice(ii, 1)` → `splice(ii, 1)` (currently discarded — real bug). |
| 1.3 | `shared/api/utils.js:4` | Hardcoded `version = "0.5.1"` → read from `package.json` (`require("../../package.json").version`). |
| 1.4 | `deploy/lib/createFunctions.js:21-30` | Await fire-and-forget `deleteFunctionsByIds` promises. |
| 1.5 | `deploy/lib/createFunctions.js:65-91` | Await `applyDomainsFunc` promises. |
| 1.6 | `deploy/lib/createContainers.js:63-73` | Await `deleteContainersByIds` promises. |
| 1.7 | `deploy/lib/createContainers.js:76-103` | Await `applyDomainsContainer` promises. |
| 1.8 | `deploy/lib/deployFunctions.js:41-52` | Await `waitForDomainsDeployment` promises. |
| 1.9 | `deploy/lib/deployContainers.js:18-24` | Await `waitDomainsAreDeployedContainer` promises. |
| 1.10 | `shared/api/domain.js:35-54` | Await `createDomainAndLog` promise (currently fire-and-forget). |
| 1.11 | `package.json` dependencies | Bump `axios` 1.4.0 → 1.7.x, `argon2` 0.30.3 → 0.43.x, `dockerode` 4.0.6 → latest 4.x. |

---

## Phase 2 — Remove `logs/` Command

| # | Action |
|---|--------|
| 2.1 | Delete `logs/scalewayLogs.js`, `logs/lib/getLogs.js`, `logs/lib/`, `logs/` directory. |
| 2.2 | Remove `ScalewayLogs` from `index.js:8` and `index.js:22`. |
| 2.3 | Remove `logs` section from `README.md` (lines 287-299). |
| 2.4 | Delete `shared/api/logs.js` (only consumer was `getLogs.js`). |
| 2.5 | Remove `logsApi` require + `Object.assign` entries from `shared/api/index.js:9,33,50`. |

---

## Phase 3 — Remove `jwt/` Command

| # | Action |
|---|--------|
| 3.1 | Delete `jwt/scalewayJwt.js`, `jwt/lib/getJwt.js`, `jwt/lib/`, `jwt/` directory. |
| 3.2 | Remove `ScalewayJwt` from `index.js:7` and `index.js:20`. |
| 3.3 | Remove `jwt` section from `README.md` if present. |
| 3.4 | Delete `shared/api/jwt.js` (only consumer was `getJwt.js`). |
| 3.5 | Remove `jwtApi` require + `Object.assign` entries from `shared/api/index.js:8,32,49`. |
| 3.6 | Update `docs/` — remove any JWT/token documentation references. |

---

## Phase 4 — TypeScript Migration + SDK Adoption

### 4.1 Tooling setup

**Add devDependencies:**
- `typescript@^5.5`
- `@types/node@^20`
- `@types/jest@^29`
- `@types/dockerode`
- `@types/js-yaml`
- `typescript-eslint`

**Add runtime dependencies:**
- `@scaleway/sdk-client`
- `@scaleway/sdk-function`
- `@scaleway/sdk-container`
- `@scaleway/sdk-registry`

**Remove dependencies:**
- `bluebird` (deprecated, replaced by native async/await)
- `axios` (replaced by SDK's HTTP layer)
- `@serverless/utils` (single call site replaced by inline helper)

**Add `tsconfig.json`:**
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests", "examples"]
}
```

**Update `package.json`:**
- `"main": "dist/index.js"`
- `"engines": { "node": ">=20" }`
- `"files": ["dist", "README.md", "LICENSE"]`
- Add scripts: `"build": "tsc"`, `"prepublishOnly": "npm run build"`, `"typecheck": "tsc --noEmit"`

### 4.2 Directory restructure

```
src/
  index.ts
  provider/scalewayProvider.ts
  deploy/
    scalewayDeploy.ts
    lib/
      createNamespace.ts
      createFunctions.ts
      createContainers.ts
      buildAndPushContainers.ts
      uploadCode.ts
      deployFunctions.ts
      deployContainers.ts
      deployTriggers.ts
  remove/
    scalewayRemove.ts
    lib/removeNamespace.ts
  invoke/scalewayInvoke.ts
  info/
    scalewayInfo.ts
    lib/display.ts
  shared/
    constants.ts
    runtimes.ts
    domains.ts
    secrets.ts
    singleSource.ts
    validate.ts
    setUpDeployment.ts
    child-process.ts
    write-service-outputs.ts
    concurrency.ts          <- NEW: mapWithConcurrency helper
    api/
      index.ts              <- thin shim: FunctionApi/ContainerApi/RegistryApi
      client.ts             <- builds SDK client, attaches retry interceptor
```

Delete old `.js` source files after `tsc` produces working output in `dist/`.

### 4.3 SDK integration

**New `src/shared/api/client.ts`** — builds the SDK `Client` from resolved credentials:
- Uses `createClient({ apiURL, secretKey, defaultProjectId, defaultRegion })`.
- `apiURL` from `SCW_API_URL` env var or default `https://api.scaleway.com` (replaces separate `SCW_FUNCTION_URL` / `SCW_CONTAINER_URL`).
- Attaches `User-Agent: serverless-scaleway-functions/<version>` via `withUserAgentSuffix`.
- Attaches retry interceptor via `withAdditionalInterceptors` — retries on 5xx and 429 with exponential backoff (3 attempts max). Uses SDK's `createExponentialBackoffStrategy` from `interval-retrier`.

**New `src/shared/api/index.ts`** — thin shim for backward compat with tests:
```ts
export class FunctionApi {
  private sdkApi: Function.v1.API;
  constructor(apiUrl: string, token: string) {
    this.sdkApi = new Function.v1.API(buildClient(apiUrl, token));
  }
  // delegate methods to this.sdkApi
}
// Same for ContainerApi, RegistryApi
```
This allows tests' `new FunctionApi(apiUrl, scwToken)` calls to keep working unchanged.

**Replaces entirely:**
- `shared/api/utils.js` (getApiManager, manageError, CustomError) — SDK handles HTTP + typed errors.
- `shared/api/functions.js` — SDK's `Function.v1.API` has all methods.
- `shared/api/containers.js` — SDK's `Container.v1.API` has all methods.
- `shared/api/namespaces.js` — SDK has `listNamespaces`, `getNamespace`, `createNamespace`, `updateNamespace`, `deleteNamespace`, `waitForNamespace`.
- `shared/api/triggers.js` — SDK has `listCrons`, `createCron`, `updateCron`, `deleteCron`, `listTriggers`, `createTrigger`, `updateTrigger`, `deleteTrigger`, `waitForCron`, `waitForTrigger`.
- `shared/api/domain.js` — SDK has `listDomains`, `createDomain`, `deleteDomain`, `waitForDomain`.
- `shared/api/runtimes.js` — SDK has `listFunctionRuntimes`.
- `shared/api/account.js` — SDK has account/project APIs.
- `shared/api/registry.js` — SDK's `Registry.v1.API`.
- `shared/api/endpoint.js` — no longer needed (API built from provider credentials directly).

**SDK `waitFor*` replaces all recursive `setTimeout` polling:**
- `waitNamespaceIsReady` → `sdkApi.waitForNamespace({ namespaceId })`
- `waitFunctionsAreDeployed` → `sdkApi.waitForFunction({ functionId })` per function
- `waitContainersAreDeployed` → `sdkApi.waitForContainer({ containerId })` per container
- `waitForFunctionStatus` → `sdkApi.waitForFunction({ functionId, ...WaitForOptions })`
- `waitForContainer` → `sdkApi.waitForContainer({ containerId, ...WaitForOptions })`
- `waitDomainsAreDeployed*` → `sdkApi.waitForDomain({ domainId })`
- `waitNamespaceIsDeleted` → `sdkApi.waitForNamespace({ namespaceId })` with delete stop condition

Default `WaitForOptions`: 5min timeout, exponential backoff (SDK defaults).

### 4.4 Provider simplification

`src/provider/scalewayProvider.ts`:
- Credentials resolution delegated to SDK's `loadProfileFromConfigurationFile` / `loadProfileFromEnvironmentValues`.
- Fallback to plugin's existing `scwToken`/`scwProject` serverless.yml fields (backward compat).
- `setApiURL` simplified: single `SCW_API_URL` override (replaces `SCW_FUNCTION_URL` / `SCW_CONTAINER_URL`).
- `getFunctionCredentials` / `getContainerCredentials` removed (SDK client built once, shared).

### 4.5 Modernize async during conversion

- Delete all `require("bluebird")` imports.
- `BbPromise.bind(this).then(a).then(b)` → `async method() { await a(); await b(); }`.
- `BbPromise.map(arr, fn, { concurrency: 1 })` → `for (const x of arr) { await fn(x); }`.
- `BbPromise.map(arr, fn, { concurrency: 5 })` → `mapWithConcurrency(arr, 5, fn)` helper in `src/shared/concurrency.ts`.
- `new Promise(r => setTimeout(() => r(...), 5000))` polling → SDK `waitFor*` methods.
- Manual `fs.readFile` callbacks → `fs/promises`.

### 4.6 Architectural refactor during conversion

Eliminate the `Object.assign(this, validate, setUpDeployment, ..., api)` mixin pattern:

```ts
// Before (deploy/scalewayDeploy.js)
class ScalewayDeploy {
  constructor(serverless, options) {
    Object.assign(this, validate, setUpDeployment, createNamespace, ..., api);
  }
}

// After (src/deploy/scalewayDeploy.ts)
class ScalewayDeploy {
  private api: FunctionApi | ContainerApi;
  private deployer: Deployer;
  constructor(serverless: Serverless, options: Options) {
    this.api = getApi(serverless);
    this.deployer = new Deployer(serverless, options, this.api);
  }
}
```

`Deployer` (in `src/shared/deployer.ts`) holds deploy steps as methods taking explicit arguments. Same treatment for `Invoke`, `Remove`, `Info`.

### 4.7 ESLint + Prettier

- Replace `eslint.config.mjs` with TypeScript flat config (`typescript-eslint`).
- Bump Prettier v2.8.8 → v3.3.x, run `prettier --write .` once.
- Update CI lint job: `tsc --noEmit && eslint . && prettier --check .`.
- Remove `no-unused-vars: off` for tests (TS handles via `noUnusedLocals`).

### 4.8 Tests: minimal mechanical updates only

- Update `require("../../shared/...")` → `require("../../dist/shared/...")` in:
  - `tests/functions/functions.test.js`
  - `tests/containers/containers.test.js`
  - `tests/containers/containers_private_registry.test.js`
  - `tests/multi-region/multi_region.test.js`
  - `tests/triggers/triggers.test.js`
  - `tests/runtimes/runtimes.test.js`
  - `tests/utils/clean-up.js`
  - `tests/shared/validate.tests.js`
  - `tests/shared/secrets.test.js`
  - `tests/shared/child-process.tests.js`
- Add `pretest` hook: `"pretest": "npm run build"` so tests run against compiled output.
- Integration tests' `new FunctionApi(apiUrl, scwToken)` still works via the shim.

### 4.9 `write-service-outputs.ts`

Replace `@serverless/utils` import with inline helper:
```ts
function writeText(text: string) {
  process.stdout.write(text + "\n");
}
const aside = (text: string) => `\x1b[2m${text}\x1b[0m`; // dim
```

---

## Phase 5 — Tooling & CI

| # | Action |
|---|--------|
| 5.1 | Add `.nvmrc` with `20`. |
| 5.2 | Add `CODEOWNERS` file. |
| 5.3 | Expand `.gitignore`: add `coverage/`, `.DS_Store`, `*.log`, `dist/`, `.tsbuildinfo`, `*.tsbuildinfo`. |
| 5.4 | Update `.github/workflows/test.yml`: drop Node 18, add Node 22; add `typecheck` + `build` jobs/steps; drop pinned `prettier@2.8.8`. |
| 5.5 | Update `.github/workflows/publish.yml`: add `npm run build` before `npm publish`. |
| 5.6 | Bump `osls` in CI from pinned `3.51.0` to latest v3. |
| 5.7 | Add `typecheck` script to package.json. |

---

## Phase 6 — Documentation

| # | Action |
|---|--------|
| 6.1 | `README.md`: remove `logs` command section; remove `jwt` command references; document `engines: node >=20`; document new `SCW_API_URL` env var (replaces `SCW_FUNCTION_URL`/`SCW_CONTAINER_URL`). |
| 6.2 | `docs/development.md`: fix env var docs (currently shows deprecated `SCW_TOKEN`/`SCW_PROJECT` → `SCW_SECRET_KEY`/`SCW_DEFAULT_PROJECT_ID`); add `npm run build` + `npm run typecheck` sections; remove JWT/token documentation. |
| 6.3 | `docs/`: remove any `jwt.md` or token-related docs if present. |
| 6.4 | `CONTRIBUTING.md`: add TypeScript build step to "Submit code" checklist. |
| 6.5 | `CHANGELOG.md`: add entries for all phases (user will version). |

---

## Breaking Changes Summary (for CHANGELOG)

- `serverless logs` command removed (deprecated since 2024-03-12).
- `serverless jwt` command removed.
- Node.js minimum version raised to 20.
- `SCW_FUNCTION_URL` and `SCW_CONTAINER_URL` env vars consolidated into `SCW_API_URL`.
- `bluebird` dependency removed.
- `axios` dependency removed (replaced by `@scaleway/sdk-*`).
- `@serverless/utils` dependency removed.
- Source rewritten in TypeScript; `dist/` is the published artifact.
- `Object.assign` mixin pattern eliminated; internal architecture refactored.
- All `waitXxx` polling reimplemented via SDK's `waitFor*` with exponential backoff.
- `rejectUnauthorized: false` TLS bypass removed (security fix).
- `singleSource.slice` bug fixed (was silently dropping nothing).
- Fire-and-forget promises in deploy/remove/domain flows now properly awaited.

---

## Definition of Done

- [ ] `rejectUnauthorized: false` removed
- [ ] `singleSource.slice` bug fixed
- [ ] Version read from `package.json`
- [ ] All fire-and-forget promises awaited
- [ ] `axios`, `argon2`, `dockerode` bumped
- [ ] `logs/` directory and all references removed
- [ ] `jwt/` directory and all references removed
- [ ] `bluebird` removed from deps and source
- [ ] `axios` removed from deps
- [ ] `@serverless/utils` removed from deps
- [ ] `@scaleway/sdk-*` deps added
- [ ] All source files under `src/` are `.ts`, strict mode, zero `any`
- [ ] `npm run build` produces `dist/` with no errors
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] All `waitXxx` methods use SDK's `waitFor*`
- [ ] `Object.assign(this, ...)` pattern eliminated
- [ ] Tests' require paths updated; `npm test` passes
- [ ] `engines: { node: ">=20" }` in `package.json`
- [ ] CI matrix: Node 20 + 22, with `typecheck` + `build` jobs
- [ ] Prettier v3, ESLint with TypeScript
- [ ] `.gitignore` expanded
- [ ] `SCW_API_URL` consolidated env var documented
- [ ] README/docs updated
