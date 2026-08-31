"use strict";

const jestExpect = expect;

const {
  scalewayFetch,
  createScalewayClient,
} = require("../../shared/api/sdkClient");

function transientError() {
  return new TypeError("fetch failed", {
    cause: new Error("other side closed"),
  });
}

describe("scalewayFetch", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("returns the response immediately on success, without retrying", async () => {
    const response = { ok: true };
    global.fetch = jest.fn().mockResolvedValue(response);

    const result = await scalewayFetch("https://x", {
      method: "GET",
    });

    jestExpect(result).toBe(response);
    jestExpect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("attaches a non-persistent (near-zero keep-alive) dispatcher to every request", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await scalewayFetch("https://x", { method: "GET" });

    const [, init] = global.fetch.mock.calls[0];
    jestExpect(init.dispatcher).toBeDefined();
    jestExpect(init.dispatcher.constructor.name).toBe("Agent");
  });

  it("retries a GET on a transient network error and succeeds on the next attempt", async () => {
    const response = { ok: true };
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce(response);

    const resultPromise = scalewayFetch("https://x", {
      method: "GET",
    });

    await jest.advanceTimersByTimeAsync(1000);

    await jestExpect(resultPromise).resolves.toBe(response);
    jestExpect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts, throwing the last transient error", async () => {
    global.fetch = jest.fn().mockRejectedValue(transientError());

    const resultPromise = scalewayFetch("https://x", {
      method: "GET",
    });
    const assertion = jestExpect(resultPromise).rejects.toThrow("fetch failed");

    await jest.advanceTimersByTimeAsync(5000);

    await assertion;
    jestExpect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a POST, even on a transient network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(transientError());

    await jestExpect(
      scalewayFetch("https://x", { method: "POST" }),
    ).rejects.toThrow("fetch failed");
    jestExpect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-network error (e.g. a real HTTP error response)", async () => {
    // fetch() itself never rejects for an HTTP error status - this
    // documents that a *thrown* non-TypeError (anything that isn't the
    // network-failure shape) is never retried either, regardless of
    // method.
    const err = new Error("not a network error");
    global.fetch = jest.fn().mockRejectedValue(err);

    await jestExpect(
      scalewayFetch("https://x", { method: "GET" }),
    ).rejects.toThrow("not a network error");
    jestExpect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("infers the method from a Request object when no init is given", async () => {
    global.fetch = jest.fn().mockRejectedValue(transientError());
    const request = new Request("https://x", { method: "DELETE" });

    const resultPromise = scalewayFetch(request);
    const assertion = jestExpect(resultPromise).rejects.toThrow();

    await jest.advanceTimersByTimeAsync(5000);

    await assertion;
    // DELETE is idempotent, so this should have retried up to 3 times.
    jestExpect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

describe("scalewayFetch verbose body logging", () => {
  let consoleSpy;

  beforeEach(() => {
    // stderr, not stdout - see logFetch's own comment: stdout is what
    // execSync() captures as "the invoke output" a live test asserts
    // against, and these log lines must never end up mixed into that.
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function loggedLines() {
    return consoleSpy.mock.calls.map((args) => args[0]).join("\n");
  }

  // Regression test for the exact bug this logging previously caused: a
  // mocked response/request object (as most of this test suite's own
  // fetch mocks are) commonly doesn't implement .clone() the way a real
  // Response/Request does. Calling it unguarded threw a TypeError *inside*
  // scalewayFetch's own try/catch around fetch(), which isTransientNetworkError
  // (instanceof TypeError alone) misclassified as a transient network
  // failure and retried for real - hanging any test using fake timers that
  // weren't advanced to cover the unexpected extra attempt.
  it("logs <unavailable> instead of throwing when the response has no .clone(), and does not trigger a spurious retry", async () => {
    const fakeResponse = { ok: true, status: 200 };
    global.fetch = jest.fn().mockResolvedValue(fakeResponse);

    const result = await scalewayFetch("https://x", { method: "GET" });

    jestExpect(result).toBe(fakeResponse);
    jestExpect(global.fetch).toHaveBeenCalledTimes(1);
    jestExpect(loggedLines()).toContain("<unavailable>");
  });

  it("redacts secret_environment_variables in both the request and response body logs", async () => {
    const responseBody = JSON.stringify({
      id: "ns-1",
      secret_environment_variables: [{ key: "A", hashedValue: "abc123" }],
    });
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(responseBody, { status: 200 }));

    const requestBody = JSON.stringify({
      name: "ns",
      secret_environment_variables: [
        { key: "A", value: "super-secret-plaintext" },
      ],
    });
    await scalewayFetch("https://x", { method: "POST", body: requestBody });

    const logged = loggedLines();
    jestExpect(logged).not.toContain("super-secret-plaintext");
    jestExpect(logged).not.toContain("abc123");
    jestExpect(
      logged.match(/"secret_environment_variables":"<redacted>"/g),
    ).toHaveLength(2);
  });

  it("logs a binary request body by type only, never as text", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await scalewayFetch("https://x", {
      method: "PUT",
      body: new Uint8Array([1, 2, 3]),
    });

    jestExpect(loggedLines()).toContain("<binary body>");
  });
});

describe("createScalewayClient", () => {
  // Regression test: createClient({..., httpClient: scalewayFetch}) silently
  // drops the custom httpClient (verified directly against the installed
  // @scaleway/sdk-client package - its createClient() only runs settings
  // through withProfile(), which copies a fixed allowlist of fields that
  // doesn't include httpClient), so every SDK-routed request was actually
  // using the bare global fetch - none of scalewayFetch's retry/dispatcher
  // behavior above was ever reaching real API traffic. This is what
  // createAdvancedClient()+withHTTPClient() in sdkClient.ts now fixes.
  it("wires scalewayFetch in as the SDK client's httpClient", () => {
    const client = createScalewayClient({
      secretKey: "11111111-1111-1111-1111-111111111111",
      region: "fr-par",
    });

    jestExpect(client.settings.httpClient).toBe(scalewayFetch);
  });
});
