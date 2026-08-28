# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is `serverless-scaleway-functions`, a plugin for the [Serverless Framework v3](https://github.com/oss-serverless/serverless) that adds a `scaleway` provider, letting `serverless.yml` files deploy Scaleway Serverless Functions and Scaleway Serverless Containers. Published to npm as a CommonJS library, not an application — written in TypeScript, compiled to `dist/` before publish (see `docs/typescript-migration.md`).

## Commands

Package manager is [Bun](https://bun.sh) (`bun.lock` is the source of truth; `patches/` holds `bun patch` fixes for two of `ssh2`'s transitive native dependencies that otherwise crash under Bun — see the Bun compatibility note below). `bun install` also runs `prepare` (`npm run build` under the hood), so `dist/` is always rebuilt after install.

```bash
bun install              # install deps, applies patches/, rebuilds dist/ via `prepare`
bun run typecheck        # tsc --noEmit
bun run build            # tsc (emits dist/)
bun run lint             # eslint . --cache
bun run check-format     # prettier --check .
bun run format           # prettier --write .
bun run coverage         # jest --coverage
```

### Tests are integration tests, not unit tests

Most of `tests/` deploys real functions/containers against the live Scaleway API and tears them down again — there is no mocking layer for the API calls. Running them requires:

- Docker installed and usable
- The `serverless`/`osls` CLI installed globally
- A real Scaleway account/project with quota, and credentials exported as `SCW_TOKEN` / `SCW_PROJECT` (or `SCW_SECRET_KEY` / `SCW_DEFAULT_PROJECT_ID`)

Do not assume `bun run test:*` can run in a sandboxed/offline environment. Test suites are split by area and run independently (`package.json` scripts and CI matrix in `.github/workflows/test.yml` both enumerate them):

```bash
bun run test:functions        # tests/functions
bun run test:containers       # tests/containers/containers.test.js
bun run test:containers-private
bun run test:deploy           # tests/deploy
bun run test:domains          # tests/domain
bun run test:multi-region     # tests/multi-region
bun run test:provider         # tests/provider
bun run test:runtimes         # tests/runtimes (slowest, ~6 min — builds/deploys all example templates)
bun run test:shared           # tests/shared — closest thing to pure unit tests (validate, secrets, child-process)
bun run test:triggers         # tests/triggers
```

These all still run under **Jest**, not `bun test` — Bun here is only the package manager and script runner (`bun run <script>` just spawns the same `jest` binary `npm run` would). Don't invoke `bun test` directly for these suites: some rely on `jest`-specific fake-timer APIs (`jest.advanceTimersByTimeAsync`) that `bun:test`'s Jest-compatibility shim doesn't implement yet, and a couple of test-utility deps had to be patched (see below) just to let `bun install`/`bun run` work at all — full `bun test` support is a separate, not-yet-done migration (`docs/fixing-plan.md` M7).

Run a single test by name: `jest tests/<suite> -t "test name regex"`. Jest timeout is set very high (`tests/setup-tests.js`, 5,000,000ms) because deploys are slow. `bun run clean-up` (`tests/teardown.js`) removes leftover namespaces/registries from failed runs — CI always runs it in an `if: always()` job.

CI (`.github/workflows/test.yml`) sets up Bun, runs prettier check + typecheck + build, then the full test matrix (each suite x Node 20/22, tests still executed via `jest` under Node — Bun is only used to install deps and invoke the `bun run test:*` scripts) against real Scaleway credentials from repo secrets, then cleanup.

## Architecture

### Plugin registration

`index.js` is the plugin entry point. It registers one class per Serverless Framework lifecycle concern with `serverless.pluginManager.addPlugin`:

- `provider/scalewayProvider.js` — registers the `scaleway` provider itself, resolves credentials (CLI flags > `SCW_SECRET_KEY`/`SCW_DEFAULT_PROJECT_ID` > deprecated `SCW_TOKEN`/`SCW_PROJECT` > `~/.config/scw/config.yaml`) and region.
- `deploy/scalewayDeploy.js` — hooks into `deploy:deploy` etc.
- `remove/scalewayRemove.js`
- `invoke/scalewayInvoke.js`
- `jwt/scalewayJwt.js`
- `logs/scalewayLogs.js` (deprecated command, kept for compat)
- `info/scalewayInfo.js`

### Mixin pattern

Each top-level plugin class (e.g. `ScalewayDeploy`) does not implement its logic inline. Instead its constructor `Object.assign`s a set of small modules from its `lib/` subfolder (and from `shared/`) onto `this`, then wires them together via `this.hooks`, chaining steps with Bluebird promises. Example: `deploy/scalewayDeploy.js` composes `shared/validate.js`, `shared/setUpDeployment.js`, and everything in `deploy/lib/` (`createNamespace`, `createFunctions`, `createContainers`, `buildAndPushContainers`, `uploadCode`, `deployFunctions`, `deployContainers`, `deployTriggers`), plus `shared/api/*` for HTTP calls. When touching one of these plugins, look at the `this.hooks` block in its top-level file first — that's the map of the whole flow — then follow into the relevant `lib/` module.

Deploy flow branches on whether `serverless.yml` defines `functions` (functions path) or `custom.containers` (containers path); a service can't mix both today per the mixin's `chainFunctions`/`chainContainers` logic.

### Shared API client layer

`shared/api/` holds one file per Scaleway API resource. Most (`functions.ts`, `containers.ts`, `namespaces.ts`, `registry.ts`, `domain.ts`, `triggers.ts`, `account.ts`, `runtimes.ts`) now call the official `@scaleway/sdk-*` packages via a lazy `this.sdkApi` getter (`shared/api/index.ts`, `shared/api/sdkClient.ts`) instead of hand-rolled `axios` calls — the SDK owns pagination (`.all()`) and most polling (`waitForX()`); a few waiters (`waitNamespaceIsDeleted`, `waitFunctionsAreDeployed`, `waitForFunctionStatus`, `waitContainersAreDeployed`, `waitForContainer`) still hand-roll their own retry loop since there's no direct SDK equivalent for "wait for a set of resources" or "confirm a resource is gone". Each migrated file still returns the same snake_case field shape production code has always read (`error_message`, `domain_name`, `secret_environment_variables`, etc.) via a `toLegacyX()` aliasing function at the boundary — only the internal implementation changed. `sdkClient.ts`'s `createScalewayClient`/`createScalewayClientFromResourceUrl` use a constant, well-formed-but-unregistered placeholder access key (verified: `@scaleway/sdk-client` only ever transmits the secret key on the wire, never the access key — this repo's credential model has never collected one). `jwt.ts` and `logs.ts` stay on the hand-rolled `axios`/`apiManager` path permanently — there is no SDK equivalent for `issue-jwt` (a legacy, non-IAM auth mechanism) or the logs endpoint (itself deprecated in favor of Cockpit). `shared/constants.js` defines the legacy REST API base URLs (still used to derive the SDK's region/host per resource) and the default region (`fr-par`). Plugins consume all of this via `scalewayApi.getApi(this)` (`shared/api/index.ts`), not by calling `axios` or the SDK directly.

### Configuration model

A single `serverless.yml` maps to one namespace, containing either `functions:` or `custom.containers:` (mutually exclusive). `shared/validate.js` and `shared/singleSource.js` enforce config shape and the default "prune anything not in the file" deploy behavior (`singleSource`, can be disabled per-service). `shared/runtimes.js` and `shared/secrets.js` centralize runtime-list/secret handling shared across functions and containers.

### Examples as fixtures, not docs-only

`examples/` (one directory per runtime: `python3`, `nodejs`, `golang`, `rust`, etc.) is used directly by `tests/runtimes` — the runtime test suite builds and deploys these example projects against the live API. Changing an example's `serverless.yml` shape affects CI, not just documentation. `examples/**/*.js` is excluded from eslint.

## Conventions

- TypeScript source (`.ts`), compiled by `tsc` to CommonJS in `dist/`; `main` in `package.json` points at `dist/index.js`. `tsconfig.json` uses `allowJs: true` with `checkJs: false`, so any stray `.js` file still compiles/copies through untyped — currently only `shared/api/endpoint.js` remains `.js`, deliberately (see `docs/typescript-migration.md`). `bun install` rebuilds `dist/` automatically via the `prepare` script.
- **Two transitive dev/test dependencies are patched (via `bun patch`, tracked in `patches/` + `package.json`'s `patchedDependencies`) purely to keep `bun install`/`bun run` usable at all** — unrelated to this plugin's own code: `ssh2` (via `dockerode` → `docker-modem`) and its own `cpu-features` dependency each ship a native NAPI addon that **panics the entire Bun process** (`Illegal instruction`, not a catchable JS exception) when Bun tries to load them, because Bun's NAPI/libuv compat doesn't implement a function they call at init (`uv_version_string` — [oven-sh/bun#18546](https://github.com/oven-sh/bun/issues/18546), open upstream). Both patches just skip the native `require()` under Bun (`typeof Bun === 'undefined'` guard) so each package's own pre-existing pure-JS fallback (already there for platforms with no prebuilt binary) takes over — no behavior change under Node, where these patches are inert. If `ssh2`, `cpu-features`, or `dockerode` are ever bumped, re-check whether the patches still apply/are still needed (Bun may fix the upstream NAPI gap; the patches would then become dead weight, safe to remove after confirming).
- **Export/import style is deliberately split by what a file exports** (learned the hard way while unblocking a Bun migration — verify against real compiler/runtime output before assuming any of this, don't take it on faith):
  - A file exporting **one class/value that must stay `require()`-able as a bare value** (every top-level plugin class, `index.ts`, `shared/api/registry.ts`, `shared/write-service-outputs.ts`) uses `export = X`. **Never** convert these to `export default` — verified empirically that `export default` compiles to `exports.default = X` (wrapped, `__esModule`-marked), not a bare `module.exports = X`; a plain `require()` consumer — critically including the Serverless Framework's own external plugin loader for `index.ts`'s compiled output, which is not under this repo's control — would break.
  - A file exporting **an object of several mixin methods** (most of `shared/api/*.ts`, `deploy/lib/*.ts`, etc.) uses plain named exports (`export function foo() {}`) instead of `export = {...}`. Verified: `require()` sees an identical shape either way (an object with the same enumerable properties), so this is a safe, zero-consumer-impact conversion — **except** a file using `Object.defineProperties` to keep some exports intentionally non-enumerable (so `Object.assign(this, ...)` mixin calls skip them); named exports are always enumerable, so those specific files keep `export =` instead.
  - Inside any file that still uses `export =`, its own `import X from "Y"` / `import { X } from "Y"` statements can't coexist with `export =` under Bun's transpiler (`error: Cannot use import statement with CommonJS-only features` — a real, verified Bun constraint, not this repo's invention). Fix: `import X = require("Y")` for a single binding (compiles to a plain CJS `require()`, so it doesn't trip Bun's check, unlike `import X from "Y"` — and unlike a bare `const X = require("Y")`, it still gives real type inference, since TypeScript only specially types the `import X = require(...)` form). For multiple named values from one module, `import X = require("Y")` only binds one name — import the whole module once, then destructure from that already-typed local (`import ns = require("Y"); const { A, B } = ns;`), since destructuring straight off a bare `require()` call types as `any`. Type-only imports (`import type { X } from "Y"`) are fine either way — they're fully erased at compile time, so they never trip Bun's check regardless of what the importing file exports.
- **`engines.node` is `>=20.20.2`, not the more common `>=20`** — bumped for the `@scaleway/sdk-*` migration. Those packages ship `"type": "module"` (pure ESM, no CJS build); loading them via `require()` from this plugin's compiled CommonJS output only works on Node versions with synchronous `require(esm)` support, stable from 20.19/22.12 on. This is a real breaking change for anyone on an older 20.x patch, not a formality — verified via a direct `require()` test before committing to it, and don't lower it without re-verifying.
- **`@scaleway/sdk-client` validates the secret key's UUID format eagerly, at client construction time, not at first request** — constructing `this.sdkApi` in a class constructor (rather than lazily) would throw for any caller building an API instance with a non-UUID-shaped placeholder token, which several offline tests do since they never exercise SDK-backed methods. All four API classes (`shared/api/index.ts`'s `AccountApi`/`FunctionApi`/`ContainerApi`, `shared/api/registry.ts`'s `RegistryApi`) expose `sdkApi` as a lazy getter for exactly this reason — don't make it eager.
- **Check the SDK's error status via `err instanceof Errors.ScalewayError && err.status === 404`, not a specific error subclass like `Errors.ResourceNotFoundError`** — verified directly against the real API that which subclass `@scaleway/sdk-client`'s error parser constructs depends on the response body's own `type` field being an exact match (`"not_found"` for `ResourceNotFoundError`); at least one real 404 response from this API doesn't set that marker and parses as a generic error instead. `status` is present on every `ScalewayError` regardless of subclass, matching this repo's pre-migration status-code-only checks (`err.response.status`).
- Prettier (default config) is the formatting authority; CI's `lint` job runs `check-format`, not eslint, as the required gate. A separate CI job runs `typecheck` + `build` before tests, so a broken compile can't merge silently.
- PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0) — the merge process squashes commits and uses the PR title as the final commit message (see `.github/CONTRIBUTING.md`).
- Docs live in `docs/` (per-runtime notes for Go/JS/PHP/Python/Rust, plus `containers.md`, `custom-domains.md`, `events.md`, `secrets.md`, `troubleshooting.md`, `development.md`) — update the relevant file there when changing user-facing behavior, matching the config reference in `README.md`.
