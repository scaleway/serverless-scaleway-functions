"use strict";

const jestExpect = expect;

const { withRetry } = require("../../shared/retry");

describe("withRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the result immediately on success, without retrying or delaying", async () => {
    const fn = jest.fn().mockResolvedValue("ok");

    const result = await withRetry(fn);

    jestExpect(result).toBe("ok");
    jestExpect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable error and succeeds on the next attempt", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");

    const resultPromise = withRetry(fn, { isRetryable: () => true });
    await jest.advanceTimersByTimeAsync(10000);

    jestExpect(await resultPromise).toBe("ok");
    jestExpect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when isRetryable returns false", async () => {
    const err = new Error("not retryable");
    const fn = jest.fn().mockRejectedValue(err);

    await jestExpect(
      withRetry(fn, { isRetryable: () => false }),
    ).rejects.toThrow("not retryable");
    jestExpect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("still failing"));

    const resultPromise = withRetry(fn, { maxAttempts: 3 });
    const assertion =
      jestExpect(resultPromise).rejects.toThrow("still failing");
    await jest.advanceTimersByTimeAsync(60000);

    await assertion;
    jestExpect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries a resolved-but-unsatisfactory result via shouldRetryResult", async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("real value");

    const resultPromise = withRetry(fn, {
      shouldRetryResult: (r) => r === "",
    });
    await jest.advanceTimersByTimeAsync(10000);

    jestExpect(await resultPromise).toBe("real value");
    jestExpect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns the last unsatisfactory result on the final attempt instead of retrying forever", async () => {
    const fn = jest.fn().mockResolvedValue("");

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      shouldRetryResult: (r) => r === "",
    });
    await jest.advanceTimersByTimeAsync(60000);

    jestExpect(await resultPromise).toBe("");
    jestExpect(fn).toHaveBeenCalledTimes(3);
  });

  it("grows the delay's upper bound exponentially up to the cap (deterministic via mocked jitter)", async () => {
    const seenDelays = [];
    const fn = jest.fn().mockRejectedValue(new Error("x"));
    // Math.random() -> 1 always picks the top of each attempt's jitter
    // range, making the sequence exactly the upper-bound formula: this
    // fails loudly if backoff stops growing with the attempt count.
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(1);

    const resultPromise = withRetry(fn, {
      maxAttempts: 6,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
      onRetry: (_attempt, _max, delayMs) => seenDelays.push(delayMs),
    });
    resultPromise.catch(() => {});
    await jest.advanceTimersByTimeAsync(60000);
    await jestExpect(resultPromise).rejects.toThrow("x");

    jestExpect(seenDelays).toEqual([100, 200, 400, 800, 1000]);
    randomSpy.mockRestore();
  });

  it("never delays below initialDelayMs, even at the bottom of the jitter range", async () => {
    const seenDelays = [];
    const fn = jest.fn().mockRejectedValue(new Error("x"));
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);

    const resultPromise = withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
      onRetry: (_attempt, _max, delayMs) => seenDelays.push(delayMs),
    });
    resultPromise.catch(() => {});
    await jest.advanceTimersByTimeAsync(60000);
    await jestExpect(resultPromise).rejects.toThrow("x");

    jestExpect(seenDelays).toEqual([100, 100, 100]);
    randomSpy.mockRestore();
  });

  it("passes the attempt number to fn", async () => {
    const seenAttempts = [];
    const fn = jest.fn().mockImplementation((attempt) => {
      seenAttempts.push(attempt);
      return attempt < 3
        ? Promise.reject(new Error("x"))
        : Promise.resolve("ok");
    });

    const resultPromise = withRetry(fn);
    await jest.advanceTimersByTimeAsync(10000);

    jestExpect(await resultPromise).toBe("ok");
    jestExpect(seenAttempts).toEqual([1, 2, 3]);
  });

  it("uses sensible defaults when no options are given", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("x"));

    const resultPromise = withRetry(fn);
    resultPromise.catch(() => {});
    await jest.advanceTimersByTimeAsync(60000);

    await jestExpect(resultPromise).rejects.toThrow("x");
    jestExpect(fn).toHaveBeenCalledTimes(5);
  });
});
