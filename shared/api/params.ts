// Scaleway's own APIs are inconsistent about what an empty/missing required
// identifier does: verified live that an empty/undefined project_id makes
// Registry's listNamespaces silently fall back to some other, unrelated
// project's resources (see tests/utils/clean-up.ts's incident), while the
// equivalent Functions/Containers namespace list and SQS's listCredentials
// instead return an empty result or throw. Rather than depending on each
// API's own current behavior (which can differ per product and isn't
// guaranteed to stay the same across versions), every function here that
// requires a non-empty identifier validates it itself, before ever calling
// the SDK.
export function requireNonEmpty(
  value: string | undefined | null,
  paramName: string,
): string {
  if (!value) {
    throw new Error(`${paramName} must not be empty`);
  }
  return value;
}
