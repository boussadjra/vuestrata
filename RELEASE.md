# Release Process

## Versioning Policy

Vuestrata uses Semantic Versioning:

- `MAJOR` for breaking template/runtime/API changes
- `MINOR` for backward-compatible feature additions
- `PATCH` for fixes and doc/runtime alignment that does not break consumers

Supported prerelease channels:

- `alpha`
- `beta`
- `rc`

Examples:

- `2.1.0-alpha.0`
- `2.1.0-beta.2`
- `2.1.0-rc.1`

## Bump Commands

```bash
vpr version:show

vpr version:patch
vpr version:minor
vpr version:major

vpr version:prepatch
vpr version:preminor
vpr version:premajor

vpr version:prerelease
vpr version:prerelease:beta
vpr version:prerelease:rc

# explicit version or preid
vpr version:set -- 2.1.0-beta.0
vpr version:prerelease -- --preid beta
```

## Release Checklist

Every release, in order.

1. `vp check`
2. `vpr lint` and `vpr lint:maintainer -- --tests`
3. `vpr test --run`
4. `vpr test:e2e` — for a user-visible or routing change
5. **Write the migration**, if the change touches any contract in the table
   below, or the `UPGRADING.md` entry when it genuinely cannot be automated
6. Update `CHANGELOG.md`, including the **Fork impact** subsection
7. Bump the version. The root and `packages/cli/package.json` move together —
   the CLI's version _is_ the template version a project receives

   ```bash
   vpr version:prerelease        # or version:patch / :minor / :major
   ```

8. Rebuild the shipped lockfile — the bump invalidated it, and `vpr lint:maintainer`
   fails until it is current

   ```bash
   node packages/cli/src/index.mjs init --force --pristine
   ```

9. Commit, tag, push

   ```bash
   git tag v<version> && git push origin v<version>
   ```

   A tag containing a hyphen (`v2.1.0-beta.0`) is published by the GitHub
   release workflow as a prerelease.

10. Publish the CLI. Without this step nothing reaches anyone: the tag ships the
    template to GitHub, but a project takes updates from npm.

```bash
cd packages/cli && vp pm publish --access public --tag alpha
```

- `--access public` — npm defaults a scoped package to private, which fails
  without a paid account.
- `--tag alpha` — matches the prerelease channel, so `npm i @vuestrata/cli`
  keeps resolving to the last stable release. **Drop it for a stable
  release**, where `latest` is what you want. Use `--tag beta` / `--tag rc`
  on those channels.
- `prepack` builds the payload automatically. There is no step for it, and
  it is not committed: it is a copy of files that already live in this
  repository, and a committed copy is one that can disagree with them.

11. Confirm what landed

    ```bash
    vp pm view @vuestrata/cli dist-tags
    ```

## Consumer Gates And Maintainer Gates

A project built from Vuestrata inherits `vpr lint` and `vpr test --run`, and both
have to pass on ordinary development: a version bump, an edited managed file,
the first `add module`. So they carry only checks that hold for any project.

Checks that describe a _release_ of the template do not, and run for maintainers
only:

- `vpr lint:maintainer` checks that the shipped `vuestrata.lock.json` and the CLI
  payload match this checkout. `-- --tests` adds the public-surface snapshots.
- `test/unit/architecture/public-surface.test.ts` snapshots this repository's
  modules and permissions, so it runs only with `VUESTRATA_MAINTAINER=1`. CI and
  the release workflow set it in the template's own repository, and only there.

A project's equivalent of the lockfile check is `vuestrata doctor`. If the
lockfile looks stale in a project, do **not** rebuild it with
`init --force --pristine`: that records the project's edits as the upstream copy,
and the next upgrade replaces them.

## The Compatibility Rule

Projects built from Vuestrata take releases through `vuestrata upgrade`, which
can rewrite their code but only where a migration tells it how. So:

> **No breaking change ships without a migration or a documented manual step.**

A change is breaking if it alters any of these:

| Contract                                          | Where it lives                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| A slot path                                       | `DEFAULT_SLOTS` in `packages/cli/src/lib/manifest.mjs`           |
| A sentinel region name                            | `REGIONS` in `packages/cli/src/lib/registry.mjs`                 |
| A `Ui*` prop, emit or slot                        | `src/modules/app/components/ui/`                                 |
| A module barrel export                            | `src/modules/*/index.ts`                                         |
| A `core/lib` export                               | `src/modules/core/lib/`                                          |
| A semantic token name                             | `src/modules/app/styles/semantic.css`                            |
| An `IconName` member                              | `src/modules/app/types/index.ts`                                 |
| A `VUESTRATA_*` variable                          | `src/modules/core/lib/config/env.schema.ts`                      |
| The `boot()` signature                            | `src/modules/app/bootstrap/index.ts`                             |
| An auth store member boot uses                    | `src/modules/app/stores/auth.ts`                                 |
| An `AuthAdapter` member boot uses                 | `src/modules/auth/adapters/types.ts`                             |
| A function or export boot reads from another file | `state/`, `plugins/`, `config/app.config.ts`, `modules/setup.ts` |

What the last four rows name, exactly:

- `boot(App, options?)` and its options: `beforeMount`, `queryOptions` and `deps` (`BootDeps`).
- The auth store members `user`, `token`, `refreshToken`, `isAuthenticated`, `setAuth`,
  `setUser`, `clearAuth` and `setRefreshHandler`, which `bootstrap/auth-wiring.ts` reads
  through `AuthWiringStore`.
- The adapter members `transport`, `capabilities.refresh`, `refreshToken`, `getUser` and
  `resumeSession`.
- `installRuntimeBackends`, `useBuildInfo().start`, `restoreSession` (with `SessionRestoreDeps`),
  `router` and `layoutMap` (`plugins/router.ts`), `appModules` (`modules/setup.ts`), `appConfig` and
  `authAdapter` (`config/app.config.ts`), and `bootstrapTheme`, `installI18n`,
  `installErrorReporting`, `installPerformanceMonitoring`, `installStaleChunkRecovery`
  (`plugins/*`).
- From the demo layer, which only a demo build loads: `getDemoSession`, `seedDemoSuperAdmin` and
  `onInvalidation` (`state/demo`), and `startMockWorker` (`mocks/browser`).
- From the module barrels: `setupModules` and `useModuleStore` (`modules/index.ts`), and
  `createAuthAdapter` (`modules/auth`).

The permission seam added in 1.1.0 is under the same rule, and only grows:

- The `rbacOverrides` slot (`src/modules/app/config/rbac.overrides.ts`) and its `app:` regions
  `permissions`, `grants` and `withdrawn`, which the generators and `eject` write to.
- In `core/lib`: `defineRbacOverrides` and `resolveRbacOverrides` (`rbac/overrides.ts`),
  `installRbacConfig` and `tryGetRbacConfig` (`runtime.ts`), the types `AppPermissions`,
  `RbacOverrides` and `RbacConfig`, and the optional second parameter of
  `resolveRolePermissions(role, config?)`.
- `state/runtime-backends.ts` is what installs the config. A project that edited that file before
  1.1.0 keeps its copy, which installs nothing: `vuestrata doctor` warns, and the promotion note
  names the two lines to add.

Prefer a migration. Add it at `packages/cli/migrations/<version>/index.mjs`: a
`{ description, steps }` group, or an array of them when one release makes
several changes that each deserve a line in the report. Every step is
idempotent, because each prerelease on the way to `<version>` runs the migration
again, and resolves its target through the manifest (`file`, or `slot`) so it
still finds the file in a project that moved it. A step is one of four kinds:

| Kind                  | Shape                                                     | What it does                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| codemod (the default) | `{ file, apply(source, manifest, ws), incoming?, note? }` | Rewrites the file. `ws` reads the rest of the project, for a change that depends on another file.                                                                                                      |
| `note`                | `{ kind: 'note', note, file? }`                           | Nothing automatic: a line in the upgrade report.                                                                                                                                                       |
| `promote`             | `{ kind: 'promote', file, pristine, unit?, note? }`       | A file the project owned becomes managed. Adopted only when its hash is in `pristine`; an edited copy stays, with the release's version in `.vuestrata/incoming/`. Steps sharing a `unit` move as one. |
| `reclassify`          | `{ kind: 'reclassify', file, pristine?, note? }`          | A managed file becomes merged, keeping the project's `app:` entries.                                                                                                                                   |

Any step that names a file may carry `pending(source, manifest, ws)`. While it
returns false the step has nothing to do there; on a codemod it is also the
guard that tells an applied change from a file the codemod did not recognise,
which is then left alone with the `note` and the `incoming` copy. The `pristine`
hashes are what a file hashed to in the releases that shipped it. Print them
from the tags rather than computing them by hand, with `--json` last:

```bash
node packages/cli/scripts/pristine-hashes.mjs \
  --tags v1.0.1-alpha.5,v1.0.1-alpha.6 --class managed <path...> --json
```

`packages/cli/src/lib/migrations.mjs` documents each kind in full, and
`migrations/1.1.0/` has a codemod, a guarded codemod, a note and a promotion to
copy from.

When a change genuinely cannot be automated, write the manual step in
`UPGRADING.md` under that version — but treat that as the exception, because a
release note is a request and a migration is a fix.

A file that becomes managed keeps its path, and a project that edited it keeps its
copy: the migration leaves it, with the release's version in `.vuestrata/incoming/`.
So for one minor after a promotion, managed code must not assume the edited copy has
what the release added. A member a release adds to the auth store or to an adapter is
declared optional where the bootstrap reads it, and called only after a
`typeof member === 'function'` check; it becomes required in the next minor.

Deprecate rather than rename where you can: keep the old name working for one
minor with a console warning, and remove it in the next.
