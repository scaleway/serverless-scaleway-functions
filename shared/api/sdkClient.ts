// createClient() (the simple factory) silently drops a custom `httpClient`:
// internally it only runs the passed settings through withProfile(), which
// copies over a fixed allowlist of fields (apiURL, defaultRegion, etc) and
// has no knowledge of `httpClient` at all - verified directly against the
// installed package (client-ini-factory.js's withProfile) and by
// constructing a client with a marker httpClient and observing
// `client.settings.httpClient` come back as the untouched global `fetch`,
// not the marker. createAdvancedClient() + the explicit withHTTPClient()
// config factory is the only path that actually wires a custom httpClient
// into `settings` - see docs/fixing-plan.md's M10 for the incident this
// was found from (the NON_PERSISTENT_DISPATCHER/retry fix below had never
// actually been reaching any SDK-routed request).
import {
  createAdvancedClient,
  withHTTPClient,
  withProfile,
} from "@scaleway/sdk-client";
import type { Client } from "@scaleway/sdk-client";
import type { Region } from "@scaleway/sdk-client";
// Pinned to 6.x deliberately - undici@8.10.0's Agent type-checks fine but
// breaks at runtime against Node's internally-vendored undici. Re-verify
// with a real request (not just tsc) before bumping past 6.x - see
// docs/fixing-plan.md's M10 for the full investigation.
import { Agent } from "undici";
import { withRetry } from "../retry";

// Well-formed-but-unregistered is enough: @scaleway/sdk-client requires
// accessKey to match `^SCW[A-Z0-9]{17}$` before it'll authenticate at
// all, but only ever transmits secretKey on the wire - this repo has
// never collected a real access key. See docs/fixing-plan.md's M10 for
// the verification against the real API.
const PLACEHOLDER_ACCESS_KEY = `SCW${"0".repeat(17)}`;

export interface ScalewayClientOptions {
  secretKey: string;
  region: string;
  apiUrl?: string;
}

// Avoids a genuine race in undici's connection pool - a pooled keep-alive
// socket can be reused in the same instant an intermediary (NAT/proxy/
// load balancer) between us and the Scaleway API closes it for being
// idle. keepAliveTimeout/keepAliveMaxTimeout of 1ms evicts a socket from
// the pool essentially the instant it goes idle - functionally
// equivalent to `Connection: close` (which fetch() itself refuses to let
// a caller set directly). Tuning the timeout instead of near-eliminating
// it would only narrow the race, not close it - Scaleway doesn't publish
// (or guarantee) the intermediary's own timeout. Shared module-wide since
// constructing the Agent is the expensive part, not holding a reference
// to it. Full investigation: docs/fixing-plan.md's M10.
const NON_PERSISTENT_DISPATCHER = new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1,
});

// Defense-in-depth on top of the fix above, for a genuine one-off network
// blip unrelated to socket reuse. Only idempotent methods (GET/HEAD/
// OPTIONS/PUT/DELETE) - retrying a POST/PATCH that failed at the network
// level is unsafe, since there's no way to know whether the server
// already processed the request before the connection dropped; retrying
// could create a duplicate resource. This repo's create/update calls
// (createFunction, createNamespace, etc.) intentionally stay non-retried.
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_INITIAL_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2000;
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

function isTransientNetworkError(err: unknown): boolean {
  // The Fetch API spec only throws (rejects) for network-level failures -
  // an HTTP error status still resolves normally. Node's fetch (undici)
  // throws a TypeError wrapping the real cause (e.g. a SocketError) for
  // exactly these cases.
  return err instanceof TypeError;
}

// Opt-in, off by default so a real `serverless deploy` run never gets this
// (this file is shared production code, not test-only) - tests/setup-tests.js
// turns it on for every test run by setting the env var before any test
// file loads. Deliberately NOT @scaleway/sdk-client's own
// enableConsoleLogger("debug"): verified live that it breaks every request
// with a body (POST/PUT/PATCH - every create/update/deploy call) with
// "TypeError: Cannot construct a Request with a Request object that has
// already been used" - its debug-only request dump interceptor constructs
// a temporary Request from the real one purely to log its headers safely,
// which per the Fetch spec consumes the original's body stream, and then
// hands the now-consumed original back to be actually sent. Logging only
// method/url/status/error here instead - never touching headers or body at
// all - sidesteps that bug entirely and also makes the "don't leak the
// token" question moot: the token only ever travels in a header this never
// reads, not in the URL or method.
const VERBOSE_FETCH_LOGGING = process.env.SCW_FETCH_DEBUG === "1";
let fetchRequestCounter = 0;

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function logFetch(message: string): void {
  if (VERBOSE_FETCH_LOGGING) {
    console.log(`[scalewayFetch] ${message}`);
  }
}

// Exported for direct unit testing - not part of this module's intended
// public surface otherwise (createScalewayClient wires it in already).
// `dispatcher` is a Node-specific fetch() extension (undici.Dispatcher)
// not present in the DOM RequestInit type fetch()'s own signature is
// typed against, hence the cast below - Node's runtime fetch reads it off
// the plain init object regardless of what TypeScript's lib.dom.d.ts
// knows about.
export const scalewayFetch: typeof fetch = (input, init) => {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const canRetry = IDEMPOTENT_METHODS.has(method);
  // `as unknown as RequestInit`: the `undici` package's own Dispatcher type
  // and the `undici-types` (`@types/node`)-sourced Dispatcher type that
  // lib.dom's global RequestInit is built against are structurally close
  // but not identical (diverge deep in their internal method signatures),
  // so TypeScript refuses a direct cast between them even though they're
  // the same shape at runtime - both are just plain undici Agent
  // instances.
  const initWithDispatcher = {
    ...init,
    dispatcher: NON_PERSISTENT_DISPATCHER,
  } as unknown as RequestInit;

  const requestId = ++fetchRequestCounter;
  const url = urlOf(input);
  logFetch(`#${requestId} ${method} ${url}`);

  return withRetry(
    async (attempt) => {
      try {
        const response = await fetch(input, initWithDispatcher);
        logFetch(`#${requestId} attempt ${attempt} -> HTTP ${response.status}`);
        return response;
      } catch (err) {
        logFetch(
          `#${requestId} attempt ${attempt} -> ERROR ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    },
    {
      maxAttempts: canRetry ? MAX_FETCH_ATTEMPTS : 1,
      initialDelayMs: RETRY_INITIAL_DELAY_MS,
      maxDelayMs: RETRY_MAX_DELAY_MS,
      isRetryable: isTransientNetworkError,
    },
  );
};

export function createScalewayClient(options: ScalewayClientOptions): Client {
  return createAdvancedClient(
    withProfile({
      accessKey: PLACEHOLDER_ACCESS_KEY,
      secretKey: options.secretKey,
      defaultRegion: options.region as Region,
      ...(options.apiUrl ? { apiURL: options.apiUrl } : {}),
    }),
    withHTTPClient(scalewayFetch),
  );
}

const DEFAULT_FALLBACK_REGION = "fr-par";

// The FunctionApi/ContainerApi/RegistryApi/AccountApi classes (shared/api/
// index.ts) are constructed with a single resource-specific URL like
// "https://api.scaleway.com/functions/v1beta1/regions/fr-par" (see
// shared/constants.ts + provider/scalewayProvider.ts's setApiURL) - a
// legacy shape from the hand-rolled axios client, predating this SDK
// migration. The SDK instead wants the bare host ("https://api.scaleway.com",
// so it can build its own per-product paths) and the region as a separate
// value. Rather than changing every constructor call site across
// production and test code, derive both from the existing URL: the region
// is whatever follows "/regions/" (present on every region-scoped resource
// URL used here); resources that aren't region-scoped (e.g. Account/Project,
// whose URL has no "/regions/" segment at all) fall back to a default,
// since the SDK's defaultRegion is simply unused for those calls.
export function createScalewayClientFromResourceUrl(
  resourceApiUrl: string,
  secretKey: string,
): Client {
  const regionMatch = resourceApiUrl.match(/\/regions\/([^/]+)/);
  const region = regionMatch ? regionMatch[1] : DEFAULT_FALLBACK_REGION;
  const apiUrl = new URL(resourceApiUrl).origin;

  return createScalewayClient({ secretKey, region, apiUrl });
}

// shared/api/index.ts's AccountApi/FunctionApi/ContainerApi (and
// registry.ts's RegistryApi) get mixed onto the top-level plugin classes
// via `Object.assign(pluginInstance, ..., apiInstance)` - and Object.assign
// only copies an object's *own* enumerable properties, converting any
// accessor into a plain value via a single Get at copy time (it never
// preserves getter/setter semantics on the target - this is fixed
// ECMAScript behavior, not a quirk of this codebase). A `get sdkApi()`
// defined in a class body lives on the *prototype*, so Object.assign never
// even sees it - this was verified the hard way: shared/api/*.ts's own
// migrated methods (functions.ts, containers.ts, etc.) all worked correctly
// against a directly-constructed `new FunctionApi(...)` (where `this.sdkApi`
// resolves via normal prototype lookup) but threw
// `Cannot read properties of undefined (reading 'listNamespaces')` the
// moment they ran through a real plugin's mixin composition, since
// `this.sdkApi` was simply never copied over.
//
// The fix: never expose `sdkApi` as an accessor at all. Instead each class
// assigns `this.sdkApi` a plain-value Proxy in its constructor - Object.assign
// copies that reference just fine (it's a normal property, like
// `apiManager`), and the Proxy itself defers constructing (and validating)
// the real @scaleway/sdk-* client until a property is actually read off it,
// preserving the original goal (never eagerly construct - see the comment
// on ScalewayClientOptions below about why: real client construction
// validates the secret key's UUID format immediately, which would throw
// for the non-UUID placeholder tokens several offline tests use, if it
// happened at plugin-construction time rather than at first real use).
export function createLazySdkApi<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  const resolve = (): T => {
    if (!instance) {
      instance = factory();
    }
    return instance;
  };
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const real = resolve();
      const value = Reflect.get(real as object, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}
