# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Enable `required` and `noExtraProps` for `typescript-json-schema`

## [0.5.3][] - 2022-05-22

- Fix typo

## [0.5.2][] - 2022-05-22

- Make `responseHeaders` optional

## [0.5.1][] - 2022-05-22

- Make `schema` optional when use `tsSchema`

## [0.5.0][] - 2022-05-22

- Migration to Serverless v2
- HTTP API v2 support
- Update dependencies
- Remove temporary validation
- Add support for defining schema via Typescript types
- Various changes and improvements

## [0.4.0][] - 2018-04-04

- Various changes

## [0.3.0][] - 2017-08-30

### Changed

- Plugin now generates OpenAPI documentation with a version of `3.0.0` instead of `3.0.0-RC2`.
- Operation now supports `deprecated` and `tags` properties.
- Parameters now support the `content` property.
- Updated various build dependencies.
- OpenAPI definition will now be smaller in most cases, choosing to omit optional properties instead of using empty defaults.

### Fixed

- Handle when `models` is not iterable.
- Handle when `models` have no `schema`.
- Always lowercase the HTTP method to conform to OpenAPI spec.

## [v0.2.1] - 2017-07-07

Last release prior to CHANGELOG being added.


[Unreleased]: https://github.com/temando/serverless-openapi-documentation/compare/v0.5.3...HEAD
[0.5.3]: https://github.com/temando/serverless-openapi-documentation/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/temando/serverless-openapi-documentation/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/temando/serverless-openapi-documentation/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/temando/serverless-openapi-documentation/compare/v0.5.0...v0.5.0
[0.5.0]: https://github.com/temando/serverless-openapi-documentation/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/temando/serverless-openapi-documentation/compare/v0.4.0...v0.4.0
[0.4.0]: https://github.com/temando/serverless-openapi-documentation/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/temando/serverless-openapi-documentation/tree/v0.3.0
