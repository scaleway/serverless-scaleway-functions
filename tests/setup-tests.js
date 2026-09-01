"use strict";

// Turns on shared/api/sdkClient.ts's own verbose fetch logging (method,
// URL, and each attempt's outcome - never headers or body, so the auth
// token can't leak) for every test run. Must be set before any test file
// (and therefore sdkClient.ts) loads, since it's read into a module-level
// constant there. Deliberately not @scaleway/sdk-client's own
// enableConsoleLogger("debug") - see the comment on VERBOSE_FETCH_LOGGING
// in sdkClient.ts for why (it breaks every request with a body).
process.env.SCW_FETCH_DEBUG = "1";

const requiredJest = jest;

requiredJest.setTimeout(5000000);
