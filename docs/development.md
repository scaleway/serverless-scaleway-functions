# Development

This plugin is written in TypeScript and compiled to `dist/` before publish; `bun install` rebuilds `dist/` automatically (via the `prepare` script), but if you edit `.ts` source directly and are running the plugin from a local checkout (see below), re-run `bun run build` to pick up your changes — `serverless` loads the compiled `dist/index.js`, not the source.

This repo uses [Bun](https://bun.sh) as its package manager (`bun.lock` is the committed lockfile); run `bun install` rather than `npm install`. The test suites themselves still run under Jest, not `bun test` — see the `## How to run tests` section below.

To run Serverless Framework with a local checkout of this plugin, you can modify the `serverless.yml` for one or more functions as follows:

```yaml

...
# Change this
plugins:
  - serverless-scaleway-functions

# To this
plugins:
  - <path to checkout of this project>
```

Then you can run commands as normal.

## Integration tests

This repository contains multiple test suites, each with its own purpose:

- [Functions](<>): tests that functions lifecycle (`serverless deploy` and `serverless remove`) works properly.
- [Containers](<>): tests that container lifecycle (`serverless deploy` and `serverless remove`) works properly.
- [Runtimes](<>): tests that our runtimes work properly by using the [examples](<>) we provide to use our platform.

### Requirements

To run your tests locally, you have to make sure of the following:

- You have docker installed (and usable from your Command Line)
- You have [Serverless CLI](https://github.com/serverless/serverless) installed (and usable from your Command Line)
- You have access to Scaleway Function's Product and Scaleway Container Registry (and still have quotas available).
- You have a Scaleway Account

### How to run tests

#### Configuration

In order to run tests locally, you have to configure your test suite (for `authentication`).

To do so, I recommend following the [guide on how to retrieve a token and your project ID](https://github.com/scaleway/serverless-scaleway-functions/blob/master/docs/README.md).

Then, add it to your environment variables:

```bash
export SCW_TOKEN=<scw-token>
export SCW_PROJECT=<scw-project>
```

Optionally, you may change the URL of our `functions` API endpoint (if you need to test different environments for example):

```bash
export SCW_URL=<url-to-functions-api>
```

#### Run Tests

We provided multiple test suites, as described above, with the following `package.json` scripts (run with `bun run <script>`, or `npm run <script>` if you prefer npm locally):

- `bun run test`: Run all test suites
- `bun run test:functions`: Run functions's test suite
- `bun run test:containers`: Run containers's test suite
- `bun run test:runtimes`: Run runtimes's test suite
- `jest -- -t "Some test regex*"`: Runs all tests matching the regex

These tests use [Jest](https://jestjs.io/docs/) under the hood — `bun run test:*` just invokes the same `jest` binary `npm run` would; it is **not** `bun test` (some suites rely on `jest`-specific APIs `bun:test`'s compatibility shim doesn't implement yet).

**Also, make sure that you did not install this repository inside a `node_modules` folder, otherwhise your test commands won't work (`no tests found`)**.

As these test suites imply real-time build/packaging of your functions/containers code and deployment to our platform, they take a bit of time (~3 minutes for functions/containers, and ~6 minutes for runtimes).
