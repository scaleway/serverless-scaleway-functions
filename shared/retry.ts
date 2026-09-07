// Generic retry-on-transient-failure helper, shared between production
// (shared/api/*.ts) and the live-API test harness (tests/utils/misc). Keeps
// one single backoff implementation instead of each call site hand-rolling
// its own fixed-interval or linear-backoff loop with its own constants.
//
// Deliberately separate from @scaleway/sdk-client's own createExponentialBackoffStrategy/
// tryAtIntervals/waitForResource (also usable here, already a dependency):
// those operate in whole seconds with a hard floor of 1s
// (`if (minDelay < 1 ...) throw` in the installed package), so they can't
// give the sub-second first-attempt delay this helper is for. They also
// have no transient-error tolerance of their own - a thrown error from the
// retried function propagates immediately rather than being retried. They
// remain the right tool for "poll a resource until it reaches a target
// state", just not for "retry the same failed request a few times".
//
// Backoff shape mirrors the SDK's own algorithm (jittered, never below the
// initial delay, growing exponentially up to a cap) for consistency, just
// on a millisecond scale with a sub-second floor allowed.

export interface RetryOptions<T> {
  /** Total attempts, including the first (non-retry) one. @defaultValue 5 */
  maxAttempts?: number;
  /** Delay before the second attempt, in ms. @defaultValue 250 */
  initialDelayMs?: number;
  /** Delay ceiling regardless of attempt count, in ms. @defaultValue 5000 */
  maxDelayMs?: number;
  /** Multiplier applied to the delay's upper bound each attempt. @defaultValue 2 */
  backoffFactor?: number;
  /** Whether a thrown error should be retried. @defaultValue always retryable */
  isRetryable?: (err: unknown) => boolean;
  /**
   * Whether a *resolved* result should still be retried (e.g. an empty
   * string standing in for "not ready yet"). If still true on the last
   * attempt, the result is returned rather than thrown.
   */
  shouldRetryResult?: (result: T) => boolean;
  /** Called right before sleeping ahead of a retry - logging only. */
  onRetry?: (
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    err: unknown,
  ) => void;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5000;
const DEFAULT_BACKOFF_FACTOR = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Jittered exponential, bounded below by initialDelayMs (never a
// near-instant retry) and above by maxDelayMs (never an unbounded wait) -
// same shape as @scaleway/sdk-client's createExponentialBackoffStrategy,
// just ms-scaled with no 1s floor.
function jitteredDelayMs(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffFactor: number,
): number {
  const upperBound = Math.min(
    maxDelayMs,
    initialDelayMs * backoffFactor ** (attempt - 1),
  );
  return initialDelayMs + Math.random() * (upperBound - initialDelayMs);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions<T> = {},
): Promise<T> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    backoffFactor = DEFAULT_BACKOFF_FACTOR,
    isRetryable = () => true,
    shouldRetryResult,
    onRetry,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result: T;
    try {
      result = await fn(attempt);
    } catch (err) {
      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const delayMs = jitteredDelayMs(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffFactor,
      );
      onRetry?.(attempt, maxAttempts, delayMs, err);
      await sleep(delayMs);
      continue;
    }

    if (shouldRetryResult?.(result) && attempt < maxAttempts) {
      const delayMs = jitteredDelayMs(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffFactor,
      );
      onRetry?.(attempt, maxAttempts, delayMs, undefined);
      await sleep(delayMs);
      continue;
    }

    return result;
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error("unreachable");
}
