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

1. Run `vp check`.
2. Run `vpr test --run`.
3. Run `vpr test:e2e` for user-visible or routing changes.
4. Update `CHANGELOG.md`.
5. Bump the version with one of the scripts above.
6. Commit the version/changelog update.
7. Tag the release as `v<version>`.

Examples:

```bash
git tag v2.0.1
git tag v2.1.0-beta.0
git push origin v2.0.1
git push origin v2.1.0-beta.0
```

Tags containing a hyphen, such as `v2.1.0-beta.0`, are published by the GitHub release workflow as prereleases.

## The Compatibility Rule

Projects built from Vuestrata take releases through `vuestrata upgrade`, which
can rewrite their code but only where a migration tells it how. So:

> **No breaking change ships without a migration or a documented manual step.**

A change is breaking if it alters any of these:

| Contract                   | Where it lives                                         |
| -------------------------- | ------------------------------------------------------ |
| A slot path                | `DEFAULT_SLOTS` in `packages/cli/src/lib/manifest.mjs` |
| A sentinel region name     | `REGIONS` in `packages/cli/src/lib/registry.mjs`       |
| A `Ui*` prop, emit or slot | `src/modules/app/components/ui/`                       |
| A module barrel export     | `src/modules/*/index.ts`                               |
| A `core/lib` export        | `src/modules/core/lib/`                                |
| A semantic token name      | `src/modules/app/styles/semantic.css`                  |
| An `IconName` member       | `src/modules/app/types/index.ts`                       |
| A `VUESTRATA_*` variable   | `src/modules/core/lib/config/env.schema.ts`            |

Prefer a migration. Add it at `packages/cli/migrations/<version>/index.mjs` as a
list of idempotent `{ file, apply }` steps, each resolving its target through
the manifest so it still finds the file in a project that moved it. When a
change genuinely cannot be automated, write the manual step in `UPGRADING.md`
under that version — but treat that as the exception, because a release note is
a request and a migration is a fix.

Deprecate rather than rename where you can: keep the old name working for one
minor with a console warning, and remove it in the next.

## Release Checklist

Replaces the numbered list above when the change touches any contract:

1. `vp check`
2. `vpr test --run`
3. `vpr test:e2e` for user-visible or routing changes
4. Write the migration, or the `UPGRADING.md` entry
5. Update `CHANGELOG.md`, including the **Fork impact** subsection
6. Bump the version — `packages/cli/package.json` moves with the root
7. Commit, tag `v<version>`, push the tag

The CLI payload needs no step. `prepack` rebuilds it from this repository on
every publish, which is why it is not committed: it is a copy of files that
already live here, and a committed copy is one that can disagree with them.
