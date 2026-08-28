import { createClient } from "@scaleway/sdk-client";
import type { Client } from "@scaleway/sdk-client";
import type { Region } from "@scaleway/sdk-client";
// Pinned to the 6.x line deliberately - verified directly (2026-08-26)
// against the real API on Node 22.22.1 that undici@8.10.0's Agent throws
// `InvalidArgumentError: invalid onRequestStart method` when passed as
// fetch()'s `dispatcher`, because the standalone npm `undici` package and
// whatever undici Node vendors internally for its built-in fetch can
// drift apart, and a newer external Agent's handler interface isn't
// necessarily one Node's internal fetch dispatch understands. undici@6.28
// works cleanly (confirmed with 5 live sequential requests against the
// real API). Re-verify the same way (a real request, not just a type
// check - the mismatch above type-checked fine and only failed at
// runtime) before ever bumping this past the 6.x line.
import { Agent } from "undici";

// The SDK's client-side auth guard (hasAuthenticationSecrets /
// assertValidAuthenticationSecrets) requires a well-formed accessKey
// (`^SCW[A-Z0-9]{17}$`) before it will even attach the authentication
// interceptor to outgoing requests - but that interceptor
// (`authenticateWithSecrets` in @scaleway/sdk-client) only ever puts
// `secretKey` on the wire, via the `X-Auth-Token` header; `accessKey` is
// never transmitted anywhere. Verified directly against the real API
// (2026-08-26): a well-formed-but-unregistered accessKey plus a real
// secretKey authenticates successfully, identically to a real accessKey.
// This repo's entire credential model (provider/scalewayProvider.ts) has
// only ever collected a secret key - there is no user-facing access-key
// concept, and none is needed here; this constant exists purely to satisfy
// the SDK's client-side format check, and is never sent to Scaleway.
const PLACEHOLDER_ACCESS_KEY = `SCW${"0".repeat(17)}`;

export interface ScalewayClientOptions {
  secretKey: string;
  region: string;
  apiUrl?: string;
}

// This repo hits an intermittent `SocketError: other side closed`
// against the real API, occasionally and identically through both this
// SDK's fetch transport and the separate axios-based paths (jwt.ts/
// logs.ts/uploadCode.ts) that predate this SDK migration - ruling out
// either HTTP client implementation as the cause. Root cause (matches
// nodejs/undici#5450, #3300, #2400 and others): undici's connection pool
// can pull a pooled keep-alive socket for reuse in the same instant the
// far end (a NAT, proxy, or load balancer sitting between us and the
// Scaleway API) closes it for being idle - a genuine race, not a fixed
// timeout misconfiguration. Tuning the client's own keepAliveTimeout to
// sit below the intermediary's idle timeout only narrows that race
// window, it can't close it - Scaleway doesn't publish (and could change)
// whatever that intermediary's timeout is.
//
// Primary fix: stop pooling connections at all. This is a deploy CLI
// making occasional, sequential requests, not a high-throughput service,
// so the usual reason to reuse a connection (skip a repeated TCP/TLS
// handshake) doesn't apply here - there's no meaningful cost to giving it
// up, and doing so removes the race entirely instead of just narrowing
// it. `fetch()` itself refuses to let a caller set a `Connection: close`
// request header directly (it's on the Fetch spec's forbidden-header
// list), so this is done via a dedicated undici Agent whose
// keepAliveTimeout/keepAliveMaxTimeout are set to 1ms: a socket is
// evicted from the pool essentially the instant it goes idle, long before
// any subsequent request in this CLI's normal (multi-hundred-ms-to-
// seconds apart) request cadence could ever reuse it - functionally
// equivalent to closing the connection after every response, without
// hand-rolling a raw undici Dispatcher.request() call just to get past
// fetch()'s forbidden-header restriction. One Agent instance is shared
// module-wide (not one per request) since constructing it is what's
// comparatively expensive, not holding a reference to it.
const NON_PERSISTENT_DISPATCHER = new Agent({
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1,
});

// Defense-in-depth on top of the fix above: even with non-persistent
// connections, a plain one-off network failure (DNS blip, connection
// refused, TLS hiccup) can still happen, and - per the undici issues
// above - the pooling race isn't strictly impossible to hit in the
// instant between eviction and reuse either. Retries only idempotent
// methods (GET/HEAD/OPTIONS/PUT/DELETE) - retrying a POST/PATCH that
// failed at the network level is unsafe in general, since there's no way
// to know whether the server actually received and processed the request
// before the connection dropped; retrying could create a duplicate
// resource. This repo's create/update calls (createFunction,
// createNamespace, etc.) intentionally stay non-retried.
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

function isTransientNetworkError(err: unknown): boolean {
  // The Fetch API spec only throws (rejects) for network-level failures -
  // an HTTP error status still resolves normally. Node's fetch (undici)
  // throws a TypeError wrapping the real cause (e.g. a SocketError) for
  // exactly these cases.
  return err instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exported for direct unit testing - not part of this module's intended
// public surface otherwise (createScalewayClient wires it in already).
// `dispatcher` is a Node-specific fetch() extension (undici.Dispatcher)
// not present in the DOM RequestInit type fetch()'s own signature is
// typed against, hence the cast below - Node's runtime fetch reads it off
// the plain init object regardless of what TypeScript's lib.dom.d.ts
// knows about.
export const scalewayFetch: typeof fetch = async (input, init) => {
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

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(input, initWithDispatcher);
    } catch (err) {
      const isLastAttempt = attempt === MAX_FETCH_ATTEMPTS;
      if (!canRetry || !isTransientNetworkError(err) || isLastAttempt) {
        throw err;
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error("unreachable");
};

export function createScalewayClient(options: ScalewayClientOptions): Client {
  return createClient({
    accessKey: PLACEHOLDER_ACCESS_KEY,
    secretKey: options.secretKey,
    defaultRegion: options.region as Region,
    httpClient: scalewayFetch,
    ...(options.apiUrl ? { apiURL: options.apiUrl } : {}),
  });
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
