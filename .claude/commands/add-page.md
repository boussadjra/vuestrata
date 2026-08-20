---
description: Add a page to an existing module
argument-hint: <module> <name> [--kind list|detail|form|blank] [--nav]
---

Add a page: `vpr gen:page $ARGUMENTS`

Preview with `--dry-run` first.

Remember: module pages are NOT file-routed. The generator's real work is editing
the module's `routes` array in `src/modules/<module>/index.ts` — a `.vue` file
alone gets you no URL and no error. See `docs/9.recipes/2.add-a-page.md`.

Keep the page thin: it coordinates, it does not implement. Queries and mutations
belong in the module's `composables/`.

Verify: `vp check && vpr test --run`
