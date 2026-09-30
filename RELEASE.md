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
2. `vpr lint`
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

8. Rebuild the shipped lockfile — the bump invalidated it, and `vpr lint` fails
   until it is current

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

Prefer a migration. Add it at `packages/cli/migrations/<version>/index.mjs` as a
list of idempotent `{ file, apply }` steps, each resolving its target through
the manifest so it still finds the file in a project that moved it. When a
change genuinely cannot be automated, write the manual step in `UPGRADING.md`
under that version — but treat that as the exception, because a release note is
a request and a migration is a fix.

A file that becomes managed keeps its path, and a project that edited it keeps its
copy: the migration leaves it, with the release's version in `.vuestrata/incoming/`.
So for one minor after a promotion, managed code must not assume the edited copy has
what the release added. A member a release adds to the auth store or to an adapter is
declared optional where the bootstrap reads it, and called only after a
`typeof member === 'function'` check; it becomes required in the next minor.

Deprecate rather than rename where you can: keep the old name working for one
minor with a console warning, and remove it in the next.
