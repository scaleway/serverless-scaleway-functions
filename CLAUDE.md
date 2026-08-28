# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This is `serverless-scaleway-functions`, a plugin for the [Serverless Framework v3](https://github.com/oss-serverless/serverless) that adds a `scaleway` provider, letting `serverless.yml` files deploy Scaleway Serverless Functions and Scaleway Serverless Containers. Published to npm as a CommonJS library, not an application — written in TypeScript, compiled to `dist/` before publish (see `docs/typescript-migration.md`).

## Commands

```bash
npm run typecheck       # tsc --noEmit
npm run build           # tsc (emits dist/, also runs automatically via `prepare` on npm install)
npm run lint            # eslint . --cache
npm run check-format    # prettier --check .
npm run format          # prettier --write .
npm run coverage        # jest --coverage
```

### Tests are integration tests, not unit tests

Most of `tests/` deploys real functions/containers against the live Scaleway API and tears them down again — there is no mocking layer for the API calls. Running them requires:

- Docker installed and usable
- The `serverless`/`osls` CLI installed globally
- A real Scaleway account/project with quota, and credentials exported as `SCW_TOKEN` / `SCW_PROJECT` (or `SCW_SECRET_KEY` / `SCW_DEFAULT_PROJECT_ID`)

Do not assume `npm run test:*` can run in a sandboxed/offline environment. Test suites are split by area and run independently (`package.json` scripts and CI matrix in `.github/workflows/test.yml` both enumerate them):

```bash
npm run test:functions        # tests/functions
npm run test:containers       # tests/containers/containers.test.js
npm run test:containers-private
npm run test:deploy           # tests/deploy
npm run test:domains          # tests/domain
npm run test:multi-region     # tests/multi-region
npm run test:provider         # tests/provider
npm run test:runtimes         # tests/runtimes (slowest, ~6 min — builds/deploys all example templates)
npm run test:shared           # tests/shared — closest thing to pure unit tests (validate, secrets, child-process)
npm run test:triggers         # tests/triggers
```

Run a single test by name: `jest tests/<suite> -t "test name regex"`. Jest timeout is set very high (`tests/setup-tests.js`, 5,000,000ms) because deploys are slow. `npm run clean-up` (`tests/teardown.js`) removes leftover namespaces/registries from failed runs — CI always runs it in an `if: always()` job.

CI (`.github/workflows/test.yml`) runs prettier check, then the full test matrix (each suite x Node 18/20) against real Scaleway credentials from repo secrets, then cleanup.

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

`shared/api/` holds one file per Scaleway API resource (`functions.js`, `containers.js`, `namespaces.js`, `registry.js`, `domain.js`, `triggers.js`, `logs.js`, `account.js`, `jwt.js`), all built on `endpoint.js`/`utils.js`. `shared/constants.js` defines the API base URLs (functions, containers, registry, account) and the default region (`fr-par`). Plugins consume these via `scalewayApi.getApi(this)` (`shared/api/index.js`), not by calling `axios` directly.

### Configuration model

A single `serverless.yml` maps to one namespace, containing either `functions:` or `custom.containers:` (mutually exclusive). `shared/validate.js` and `shared/singleSource.js` enforce config shape and the default "prune anything not in the file" deploy behavior (`singleSource`, can be disabled per-service). `shared/runtimes.js` and `shared/secrets.js` centralize runtime-list/secret handling shared across functions and containers.

### Examples as fixtures, not docs-only

`examples/` (one directory per runtime: `python3`, `nodejs`, `golang`, `rust`, etc.) is used directly by `tests/runtimes` — the runtime test suite builds and deploys these example projects against the live API. Changing an example's `serverless.yml` shape affects CI, not just documentation. `examples/**/*.js` is excluded from eslint.

## Conventions

- TypeScript source (`.ts`), compiled by `tsc` to CommonJS in `dist/`; `main` in `package.json` points at `dist/index.js`. `tsconfig.json` uses `allowJs: true` with `checkJs: false`, so any stray `.js` file still compiles/copies through untyped — currently only `shared/api/endpoint.js` remains `.js`, deliberately (see `docs/typescript-migration.md`). `npm ci`/`npm install` rebuilds `dist/` automatically via the `prepare` script.
- **Export/import style is deliberately split by what a file exports** (learned the hard way while unblocking a Bun migration — verify against real compiler/runtime output before assuming any of this, don't take it on faith):
  - A file exporting **one class/value that must stay `require()`-able as a bare value** (every top-level plugin class, `index.ts`, `shared/api/registry.ts`, `shared/write-service-outputs.ts`) uses `export = X`. **Never** convert these to `export default` — verified empirically that `export default` compiles to `exports.default = X` (wrapped, `__esModule`-marked), not a bare `module.exports = X`; a plain `require()` consumer — critically including the Serverless Framework's own external plugin loader for `index.ts`'s compiled output, which is not under this repo's control — would break.
  - A file exporting **an object of several mixin methods** (most of `shared/api/*.ts`, `deploy/lib/*.ts`, etc.) uses plain named exports (`export function foo() {}`) instead of `export = {...}`. Verified: `require()` sees an identical shape either way (an object with the same enumerable properties), so this is a safe, zero-consumer-impact conversion — **except** a file using `Object.defineProperties` to keep some exports intentionally non-enumerable (so `Object.assign(this, ...)` mixin calls skip them); named exports are always enumerable, so those specific files keep `export =` instead.
  - Inside any file that still uses `export =`, its own `import X from "Y"` / `import { X } from "Y"` statements can't coexist with `export =` under Bun's transpiler (`error: Cannot use import statement with CommonJS-only features` — a real, verified Bun constraint, not this repo's invention). Fix: `import X = require("Y")` for a single binding (compiles to a plain CJS `require()`, so it doesn't trip Bun's check, unlike `import X from "Y"` — and unlike a bare `const X = require("Y")`, it still gives real type inference, since TypeScript only specially types the `import X = require(...)` form). For multiple named values from one module, `import X = require("Y")` only binds one name — import the whole module once, then destructure from that already-typed local (`import ns = require("Y"); const { A, B } = ns;`), since destructuring straight off a bare `require()` call types as `any`. Type-only imports (`import type { X } from "Y"`) are fine either way — they're fully erased at compile time, so they never trip Bun's check regardless of what the importing file exports.
- Prettier (default config) is the formatting authority; CI's `lint` job runs `check-format`, not eslint, as the required gate. A separate CI job runs `typecheck` + `build` before tests, so a broken compile can't merge silently.
- PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0) — the merge process squashes commits and uses the PR title as the final commit message (see `.github/CONTRIBUTING.md`).
- Docs live in `docs/` (per-runtime notes for Go/JS/PHP/Python/Rust, plus `containers.md`, `custom-domains.md`, `events.md`, `secrets.md`, `troubleshooting.md`, `development.md`) — update the relevant file there when changing user-facing behavior, matching the config reference in `README.md`.
