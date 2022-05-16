# Changelog

## 0.3.2

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
