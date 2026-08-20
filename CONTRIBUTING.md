# Contributing

## Workflow

Use the `vp` CLI for all local work.

```bash
vp install
vp check
vpr test --run
```

For user-visible flow changes, also run:

```bash
vpr test:e2e
```

## Pull Requests

- Keep changes scoped and update docs when behavior changes.
- Prefer root-cause fixes over compatibility shims.
- Do not introduce direct `pnpm`, `npm`, `yarn`, or `bun` commands into docs, CI, or scripts.
- Keep `src/modules/core/lib/` framework-agnostic.
- Preserve provider independence: provider components must not import each other.
- Keep route pages thin. A page under `src/modules/*/pages/` is an inbound
  adapter: it may depend on Vue Router, normalize route input, handle
  route-level concerns (redirects, metadata, breadcrumbs, not-found, route
  access) and compose a feature screen. Reusable feature or application logic
  must live in the feature module and must not depend on route components or
  raw router state. See
  [docs/2.architecture/4.route-pages.md](docs/2.architecture/4.route-pages.md).

## Before Opening A PR

- Run `vp check`.
- Run `vpr test --run`.
- Add or update tests for behavior changes.
- Update the relevant docs under `docs/` and `README.md` when claims change.

## Commit And Release Notes

- Write clear, scoped commit messages.
- Mention any env, docs, or runtime contract changes in the PR description.
- If the change affects release behavior, update `CHANGELOG.md` and `RELEASE.md`.
