# Changelog

All notable changes to Vuestrata should be recorded here.

The project follows Semantic Versioning, including prereleases such as `-alpha.N`, `-beta.N`, and `-rc.N`.

## Unreleased

### Added

- `@vuestrata/cli` (`packages/cli`) — `init`, `add`, `diff`, `upgrade`,
  `doctor` and `eject`. The `vpr gen:*` scripts now delegate to it
- file ownership classes (`managed` / `seeded` / `merged`) and
  `vuestrata.lock.json`, which records a content hash per file so an upgrade can
  tell an untouched file from one the project edited
- slot-based path resolution, so the tooling still works in a project that
  moved things; override any slot in an optional `vuestrata.config.json`
- fork-owned override files nothing upstream writes to:
  `styles/brand.css`, `config/app.overrides.ts`, and
  `locales/<locale>.overrides.json`, deep-merged over the shell catalog
- `origin: 'demo' | 'template' | 'app'` on every module, asserted by the module
  contract test; `vuestrata eject` uses it to know what to remove
- a lint rule keeping `components/ui/**` free of application stores and feature
  modules, so the component layer stays independently upgradable
- `UPGRADING.md`, and the compatibility rule in `RELEASE.md`
- explicit version bump scripts with prerelease support
- release workflow and repository templates for contribution, issues, and pull requests

### Changed

- every registry sentinel is now a `vuestrata:` / `app:` pair rather than one
  shared `gen:` region. Upstream and local entries can no longer collide.
  Migration `1.1.0` applies this
- `UiToast` emits `show` instead of calling the notification store
- `AppFooter` reads its product name and links from `config/app.overrides.ts`
- `Plan.addFile()` requires an ownership argument; a file with no declared owner
  cannot be written
- CI now uses the repository-standard `vp` workflow
- Docker build now installs and uses `vp` for dependency installation and production builds

### Fork impact

- **Handled by `vuestrata upgrade`:** the sentinel rename.
- **Needs you:** if you used `UiToast`, add `@show="notifications.add"`. If you
  edited `semantic.css`, `AppFooter.vue` or any `Ui*` wrapper, those files are
  now yours — the upgrade leaves them alone and writes the new version to
  `.vuestrata/incoming/` to compare against.
- Run `vuestrata init` once to start tracking, then `vuestrata doctor`.

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
