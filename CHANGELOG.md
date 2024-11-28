# Changelog

## 0.4.14

### Added

- Added `healthCheck` to define a health check for containers
- Added `scalingOption` to allow scaling on concurrent requests, cpu usage or memory usage

### Fixed

- Updating an existing function or container `sandbox` option was not working

### Changed

- Following the introduction of `scalingOption`, the `maxConcurrency` parameter is now deprecated. It will continue to work but we invite you to use `scalingOption` of type `concurrentRequests` instead.

## 0.4.13

### Changed

- HTTP calls to `api.scaleway.com` are now made with a custom user agent #245

## 0.4.12

### Fixed

- Clarified documentation on currently supported Serverless Framework versions #213

### Added

- Added option to configure `sandbox` for functions and containers #224

## 0.4.10

### Changed

- Display a deprecation warning when running `serverless logs` command #212

## 0.4.9

### Fixed

- Rate limit error when creating many functions at the same time #210

## 0.4.8

### Fixed

- Error undefined directory field when creating a container from a registry image

## 0.4.7

### Added

- Typescript example
- Troubleshooting documentation
- Allow to define image instead of building them
- Using local testing packages in code samples
- Flexible resource limits (vCPU / RAM)

### Fixed

- Github actions for CI
- Documentation

## 0.4.6

### Added

- Local testing example for Go and Python #149

### Fixed

- Error display on `serverless invoke` command #148
- Timeout format in containe examples #145
- Security deps #143 #144

## 0.4.5

### Added

- `httpOption` parameter
- Support for PHP runtime

### Fixed

- Cron regex was different from console

## 0.4.4

### Added

- Support for Rust files (`.rs`)

### Fixed

- `js-yaml` dependency

## O.4.3

### Added

- `description` field is now supported in serverless config files

### Fixed

- Registry image is now forced by serverless framework to ensure consitency
- Project_id added to requests to avoid multiple results if same namespace name is used
- Clean documentaion and examples

## 0.4.2

### Added

- Support for custom domains on containers
- `maxConcurrency` parameter for containers
- Support of pulling private images
- More details on docker build errors
- Support for End of Support and End of Life runtimes

### Fixed

- Dependencies + code cleaning

## 0.4.1

### Added

- clearer error messages when building a container with a different architecture than expected `amd64` [#95](https://github.com/scaleway/serverless-scaleway-functions/pull/95)

### Fixed

- fix tests [#96](https://github.com/scaleway/serverless-scaleway-functions/pull/96)

## 0.4.0

### Added

- `serverless info` command to work with serverless compose
- `serverless invoke` command
- Custom Domains support
- `singleSource` parameter

### Changed

- Documentation
- Examples
- Contributing guideline

## 0.3.2

### Fixed

- `serverless jwt` command was using old jwt API

### Changed

- Configuration files now have a default region instead of placeholder
- Upgrade major version on outdated packages

## 0.3.1

### Added

- Runtime validation using API
- Runtimes can now be changed on update function

## 0.3.0

### Added

- Runtimes are now listed from the Scaleway API, this allow faster releases without modyfiing serverless framework [#65](https://github.com/scaleway/serverless-scaleway-functions/pull/65)
- Constants for runtime availability [#65](https://github.com/scaleway/serverless-scaleway-functions/pull/65)
- API : function to list all runtimes [#65](https://github.com/scaleway/serverless-scaleway-functions/pull/65)
- Support secret environement variables [#64](https://github.com/scaleway/serverless-scaleway-functions/pull/64)

### Fixed

- Tests are now working properly [#69](https://github.com/scaleway/serverless-scaleway-functions/pull/69)
- js-yaml usage fix for tests [#69](https://github.com/scaleway/serverless-scaleway-functions/pull/69)

## 0.2.8

### Added

- Multi region support [#62](https://github.com/scaleway/serverless-scaleway-functions/pull/62)
- Support for new environment variables `SCW_SECRET_KEY` and `SCW_DEFAULT_PROJECT_ID` [#61](https://github.com/scaleway/serverless-scaleway-functions/pull/61)
- Region parameter in examples [#62](https://github.com/scaleway/serverless-scaleway-functions/pull/62)

### Fixed

- Integration tests now use proper login API [#62](https://github.com/scaleway/serverless-scaleway-functions/pull/62)
- **Regression** could not create Go functions [#67](https://github.com/scaleway/serverless-scaleway-functions/pull/67)

---

### Changelog notice

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
