---
description: Scaffold an icon provider map
argument-hint: <name> [--prefix <iconify-prefix>]
---

Scaffold an icon set: `vp run gen:icon-set $ARGUMENTS`

It emits a complete map covering every `IconName`, with values guessed as
`i-<prefix>-<semantic-name>`. Most guesses will be wrong — correct them against
the real Iconify pack. Keys complete and values wrong is a state lint can see;
keys missing is not.

Then register it in `ICON_PROVIDERS` (`core/lib/config/env.schema.ts`) and
`builtinMaps` (`app/config/icon-provider.ts`) so it can be selected.

See `docs/9.recipes/5.add-an-icon-set.md`.
Verify: `node scripts/lint/run-custom-rules.mjs && vp check`
