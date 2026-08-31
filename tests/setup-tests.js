"use strict";

const { enableConsoleLogger } = require("@scaleway/sdk-client");

const requiredJest = jest;

requiredJest.setTimeout(5000000);

// Dumps every live Scaleway API request/response (method, full URL
// including query params, and response status/body) during a test run -
// makes it possible to see exactly which operation a live-API failure (a
// transient 403, a socket error, etc) actually came from, instead of
// reconstructing it from a stack trace after the fact. "debug" is the only
// level that triggers this: @scaleway/sdk-client's own logRequest/
// logResponse interceptors (shared/api/sdkClient.ts's createScalewayClient
// goes through these unconditionally) gate on exactly "debug", not
// "info"/"warn". Verified the auth token is never actually exposed by this:
// the SDK's own request dumper always runs requests through
// obfuscateAuthHeadersEntry first, which replaces X-Auth-Token with only
// its first 8 characters plus "-xxxx-xxxx-xxxx-xxxxxxxxxxxx" - confirmed
// live against a real secret key, not just by reading the source.
enableConsoleLogger("debug");
