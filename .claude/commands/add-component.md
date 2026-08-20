---
description: Scaffold a Ui* component wrapper
argument-hint: <Name> [--field]
---

Scaffold a component: `vpr gen:component $ARGUMENTS`

Pass `--field` for form fields — it also writes the
`composables/forms/useUi<Name>.ts` behaviour hook. The wrapper holds markup and
the `data-ui` theming hook; behaviour lives in the composable.

Colour must come from semantic tokens (`bg-card`, `text-muted-foreground`,
`border-border`). Raw palette utilities like `bg-blue-500` are rejected by lint.

See `docs/9.recipes/4.add-a-component.md`. Verify: `vp check && vpr test --run`
