# Contributing

## Workflow

Use the `vp` CLI for all local work.

```bash
vp install
vp check
vp test --run
```

For user-visible flow changes, also run:

```bash
vp run test:e2e
```

## Pull Requests

- Keep changes scoped and update docs when behavior changes.
- Prefer root-cause fixes over compatibility shims.
- Do not introduce direct `pnpm`, `npm`, `yarn`, or `bun` commands into docs, CI, or scripts.
- Keep `src/modules/core/lib/` framework-agnostic.
- Preserve provider independence: provider components must not import each other.

## Before Opening A PR

- Run `vp check`.
- Run `vp test --run`.
- Add or update tests for behavior changes.
- Update the relevant docs under `docs/` and `README.md` when claims change.

## Commit And Release Notes

- Write clear, scoped commit messages.
- Mention any env, docs, or runtime contract changes in the PR description.
- If the change affects release behavior, update `CHANGELOG.md` and `RELEASE.md`.
