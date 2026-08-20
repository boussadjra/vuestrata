---
description: Scaffold a theme
argument-hint: <name> [--label <Label>]
---

Scaffold a theme: `vpr gen:theme $ARGUMENTS`

The generator wires all four files that must agree (stylesheet, `app.css`
import, `theme.config.ts`, `ThemeName`) and places the import BEFORE
`semantic.css` — order matters, see `docs/9.recipes/3.add-a-theme.md`.

Then replace the placeholder grey ramps with the real palette: four ramps
(primary, secondary, accent, surface), steps 50–950, in BOTH colour modes.
`danger` is shared across themes in `app.css` — leave it alone unless the theme
genuinely needs a different warning hue.

Verify: `vp check`, then `vpr dev` and check both light and dark.
