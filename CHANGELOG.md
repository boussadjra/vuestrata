# Changelog

All notable changes to Vuestrata should be recorded here.

The project follows Semantic Versioning, including prereleases such as `-alpha.N`, `-beta.N`, and `-rc.N`.

## Unreleased

### Added

- explicit version bump scripts with prerelease support
- release workflow and repository templates for contribution, issues, and pull requests

### Changed

- CI now uses the repository-standard `vp` workflow
- Docker build now installs and uses `vp` for dependency installation and production builds

## 1.0.1-alpha.3 - 2026-08-20

### Fixed

- MSW handlers are anchored to the configured `VUESTRATA_API_URL` instead of a
  bare `*/<resource>` wildcard. The wildcard also matched the app's own source
  files in dev (`/src/modules/projects/presentation.ts`) and hard reloads of
  detail routes (`/dashboard/projects/42`), answering both with 401
- the demo super-admin is seeded after `setupModules()` and its grants are
  reconciled on every boot, so module-contributed permissions reach it and a
  returning visitor is no longer stuck with a stale snapshot
- a module marked `enabledByDefault` and added after a browser's first boot now
  enables instead of staying invisible forever

### Added

- `tryGetRegisteredPermissions()`, an RBAC registry read that returns an empty
  set rather than throwing when no backend is installed
- `test/unit/architecture/demo-access.test.ts`, asserting the demo account holds
  every declared permission, may open every module route, and sees every nav
  item
- `test/integration/mocks/api-scope.test.ts`, asserting the mock backend answers
  API URLs and nothing else

## 2.0.0 - 2026-06-17

### Added

- current Vue 3 starter baseline with modules, providers, docs, tests, and deployment assets
