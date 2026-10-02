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
   below, or the `UPGRADING.md` entry when it genuinely cannot be automated. If
   the release changed a file a migration installs a copy of, refresh the copies
   (`node packages/cli/migrations/<version>/shipped.mjs --write`)
6. Update `CHANGELOG.md`, including the **Fork impact** subsection in its two
   lists, "Handled by `vuestrata upgrade`" and "Needs you". Build them from the
   `Fork impact:` and `Migration:` paragraphs every commit body carries, read
   from the raw bodies (`git log <last tag>..HEAD --format='%h %s%n%b'`): a
   conventional-commits parser takes `Migration:` for a footer
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
only. `vpr lint:maintainer` (`scripts/release/maintainer-gates.mjs`) runs them
all and reports each, whether or not an earlier one failed:

| Gate               | What it checks                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `template-lock`    | `vuestrata.lock.json` records every managed and merged file, every region baseline and the `docs/` list as this checkout has them, at this version                                                                 |
| `payload`          | `packages/cli/payload` is what `build-payload.mjs` would build from this checkout (it builds one first when there is none)                                                                                         |
| `migration-files`  | the copies of project-owned files a migration installs (`migrations/<version>/shipped/`) are the files this checkout ships                                                                                         |
| `maintainer-tests` | with `-- --tests`: `public-surface.test.ts` and `test/unit/cli`, under `VUESTRATA_MAINTAINER=1`. They hold the snapshots of the public names, the payload built from this repository and what the migrations write |

`test/unit/architecture/public-surface.test.ts` snapshots this repository's
modules and permissions, and three payload tests build from the working tree, so
both are skipped without `VUESTRATA_MAINTAINER=1`. CI and the release workflow
set it in the template's own repository, and only there: the condition is
`github.repository == 'boussadjra/vuestrata'`, on the maintainer step of the
lint job, the test job and the `cli-roundtrip` job, so a renamed repository has
to update it or the gates stop running without a word. The tag-dependent
migration tests skip in a checkout without the release tags (a project has
none); with `CI` and `VUESTRATA_MAINTAINER=1` both set, missing tags fail.

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

1.1.0 also added these members. Each is additive: optional where it sits on an interface a
project may implement, and a new name everywhere else. They are contracts from here on.

| Member                                                                                      | Where                                              | Notes                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ApiAuthProvider.refresh?()` and `canRefresh?()`                                            | `core/lib/api/types.ts`                            | Optional. A provider without them keeps the `{ refreshToken }` request. `refresh()` resolves to `ApiRefreshResult \| null`        |
| `ApiAuthProvider.setAuth(token, refreshToken, expiresIn?)`                                  | `core/lib/api/types.ts`                            | The third argument is new and optional. `refreshToken` is `''` when the backend sent none                                         |
| `ApiRefreshResult`                                                                          | `core/lib/api/types.ts`                            | `{ token, refreshToken?, expiresIn? }`                                                                                            |
| `skipAuthRefresh`                                                                           | a request option of `apiFetch`                     | Takes a `401` at face value: no refresh, no replay                                                                                |
| `AppError.kind`, `retryable`, `retryAfterMs`, `messageKey`, `formErrors`; `transportError`  | `core/lib/errors`                                  | Optional fields: unset means "not classified". `ERROR_MESSAGE_KEYS` lists the keys                                                |
| `toAppError`, `parseRetryAfter`, `redactUrl`; `shouldRetryQuery`, `queryRetryDelay`         | `core/lib/api/failure.ts`, `core/lib/api/retry.ts` | The one place a failure is classified, and the one retry policy                                                                   |
| `resolveSubjectPermissions(subject)`, `PermissionSubject`                                   | `core/lib/rbac/identity.ts`                        | What a user holds. Managed code imports it by path, not through the barrel, so a project that edited `rbac/index.ts` still builds |
| the `auth.logout` event payload                                                             | `core/lib/events.ts`                               | `{ reason?: 'logout' \| 'expired' }`. Emitted by `clearAuth(reason?)`, once per session that existed                              |
| `AuthAdapter.refreshSession?()` and `canRefreshSession?()`, `RefreshedSession`              | `src/modules/auth/adapters/types.ts`               | Optional, and feature-detected in `bootstrap/auth-wiring.ts`: an adapter without them keeps the body-token refresh                |
| `safeRedirectPath`                                                                          | `src/modules/auth/lib/safe-redirect.ts`            | Returns an in-app path or the default route. Safe for `location.assign` too                                                       |
| `parseVueErrorInfo(info)`, `VueErrorCode`, `VueErrorInfo`                                   | `core/lib/errors/vue-error-info.ts`                | `{ code, name, fatal, fatalIfRepeated }`, from Vue's development or production info string                                        |
| `wasReported(error)`                                                                        | `core/lib/errors`                                  | Whether `reportError()` has seen this error object                                                                                |
| `renderBootFailure(err)`                                                                    | `src/modules/app/bootstrap/boot-error.ts`          | The signature is fixed: `boot()` calls it through `deps.renderBootFailure`, which a project may replace. It never throws          |
| `BootOptions.beforeMount`, `queryOptions`, `deps`; `removeAppLoader({ immediate? })`        | `src/modules/app/bootstrap/`                       | `boot()` also needs `onError`, `afterEach` and `currentRoute` on the router it is given: a fake router in a test must have them   |
| `isStaleChunkError`                                                                         | `src/modules/app/plugins/stale-chunk.ts`           | The project's file, and `AppErrorBoundary.vue`, which is managed, imports this from it. Removing or renaming it breaks the build  |
| `DEV_API_TARGET`                                                                            | `scripts/vite/vuestrata-plugin.mjs`                | Unprefixed on purpose: read by the dev server and never inlined                                                                   |
| the `vuestrata-stale-chunk-reload` and `vuestrata-stale-chunk-reload-baseline` storage keys | `sessionStorage`                                   | Read and written during boot                                                                                                      |

### Writing a migration

Prefer a migration. Add it at `packages/cli/migrations/<version>/index.mjs`: a
`{ description, steps }` group, or an array of them when one release makes
several changes that each deserve a line in the report.

The directory is named by **release core**: `migrations/1.1.0/` serves
`1.1.0-alpha.0`, every later prerelease and `1.1.0` itself. An upgrade runs the
migrations in `(from, releaseCore(to)]`, so each prerelease on the way to
`<version>` runs it again, and the lock keeps no record of what was applied: a
migration can gain steps between two alphas. Two rules follow, and every step
obeys both:

- **Idempotent.** Run on a project that already has the change, a step does
  nothing and says nothing.
- **Resolved through the manifest.** A step names its target by `file` (a path,
  or a function of the manifest such as `inSlot(manifest, 'appDir', rel)`) or by
  `slot`, so it still finds the file in a project that moved it.

A step is one of four kinds:

| Kind                  | Shape                                                               | What it does                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| codemod (the default) | `{ file, apply(source, manifest, ws), pending?, incoming?, note? }` | Rewrites the file. Returning the source unchanged means there was nothing to do.                                                                                                                                                                |
| `note`                | `{ kind: 'note', note, file?, pending? }`                           | Nothing automatic: a line under "Needs a person" in the upgrade report.                                                                                                                                                                         |
| `promote`             | `{ kind: 'promote', file, pristine, unit?, note? }`                 | A file the project owned becomes managed. Adopted only when its hash is in `pristine` (or already matches this release); an edited copy stays, with the release's version in `.vuestrata/incoming/`. A copy the project moved is never adopted. |
| `reclassify`          | `{ kind: 'reclassify', file, pristine?, note? }`                    | A managed file becomes merged, keeping the project's `app:` entries. Its recorded whole-file hash counts as clean once, and so does a `pristine` hash computed the merged way. Merged is the only destination.                                  |

The parts, precisely:

- **`ws`**, the third argument of `apply`, `pending`, `incoming` and a computed
  `note`, is the workspace: `ws.exists(rel)`, `ws.read(rel)` and `ws.root`. It
  is for a change that depends on another file. The new `main.ts` passes a
  project's own query options to `boot()` only when `plugins/vue-query.ts` was
  edited, and that is a question about another file.
- **`pending(source, manifest, ws)`** may sit on any step that names a file.
  While it returns false the step has nothing to do there. On a codemod it is
  also the guard: `apply` must change all of what it recognises or none of it,
  and if `pending` still holds after `apply`, the file is not in a shape the
  codemod knows. It is then left alone, and the step's `note` and `incoming`
  say so. A codemod without `pending` is unguarded: it changes what it finds,
  and never has a note.
- **`incoming`**, on a guarded codemod, is what to leave at
  `.vuestrata/incoming/<file>` for a file that was left alone: the contents, or
  a function of the source.
- **`note`** on a guarded codemod is a string, printed when the file was left
  alone. Write one that gives the change to make by hand: without it the report
  only says the file was not recognised. `note: false` leaves the incoming copy
  and prints nothing, for a
  family of steps that one `note` step after them speaks for (six container
  files left alone are one note, not six). On a `note` step it is the text, or
  a function `(source, manifest, ws)` that returns it from what the steps
  before it left behind; one that returns nothing prints nothing, and `source`
  is undefined when the step names no file. A `note` step without `pending`
  prints on every upgrade that crosses the version, so give it one.
- **`unit`**, on `promote` steps, names files that only work together. If the
  project edited any member it has, none is adopted, each gets its incoming
  copy, and only the first step's note is printed: put the note for the whole
  unit there. The two header generators are the example.
- **`pristine`** is the list of hashes a file had in the releases that shipped
  it. Print them from the tags, never by hand, with `--json` last (a bare flag
  followed by a path would take the path as its value):

  ```bash
  # a file about to become managed
  node packages/cli/scripts/pristine-hashes.mjs \
    --tags v1.0.1-alpha.5,v1.0.1-alpha.6 --class managed <path...> --json

  # a file about to become merged: hashed with its app: regions emptied
  node packages/cli/scripts/pristine-hashes.mjs \
    --tags v1.0.1-alpha.5,v1.0.1-alpha.6 --class merged <path...> --json
  ```

  The hashes describe the **old** file, the one a project has, not the one this
  release ships.

Codemods and notes run first, in the order of the groups; `promote` and
`reclassify` run after all of them, because they judge a file by its hash and
must see it after every codemod has had its turn.

**Replacing a project-owned file whole.** A migration may replace a file the
project owns (the Dockerfile, the CI workflow) when it is still a release's
copy. `migrations/1.1.0/shipped.mjs` has the helper, `replaceWithShipped({ file,
carries, ready })`: a guarded codemod that installs the copy under `shipped/`
when the file's hash is in its `pristine` list, where `carries(source)` says a
copy already has the change (which keeps the step quiet for a project that
merged it by hand) and `ready(ws)` holds the replacement back while something
it depends on has not arrived. The copies carry a `.txt` suffix so no tool reads
them as source, and the `migration-files` gate fails when one falls behind the
repository:

```bash
node packages/cli/migrations/1.1.0/shipped.mjs --check
node packages/cli/migrations/1.1.0/shipped.mjs --write   # after changing one of those files
```

When a later prerelease of the same version changes one of those files, refresh
the copy **and** add the hash the file had in the previous prerelease to its
`pristine` list. Otherwise a project that took the earlier prerelease keeps that
copy, because the step no longer recognises it. The same holds for a text hunk
a codemod replaces: `test/unit/cli/migration-1.1.0.test.ts` records what each
unedited file becomes (`BECOMES`), which is the hash the next migration needs.

`packages/cli/src/lib/migrations.mjs` documents each kind in full, and
`migrations/1.1.0/` has one of everything to copy from: a codemod
(`index.mjs`), guarded codemods on text hunks (`project-files.mjs`), whole-file
replacements with one note for the family (`deployment.mjs`), promotions and a
unit (`promotions.mjs`), reclassifications, and notes that are said once
(`notes.mjs`). Every step has a test in `test/unit/cli/` that starts from the
files the release tags hold.

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
