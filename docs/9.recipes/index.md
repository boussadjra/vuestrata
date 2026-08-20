---
title: Recipes
description: Task-shaped guides for extending the template, with generators where they earn their place.
---

# Recipes

Each recipe covers one extension task in the same shape: **what the generator
does · what it deliberately does not · what is still yours to decide · how to
verify**.

The generators exist because the failure mode they prevent is silence. A module
that is never registered in `setup.ts`, a theme imported after `semantic.css`, a
nav item pointing at a group that does not exist — none of these throw. They
produce an app that builds, passes types, and quietly does the wrong thing.

| Task                                               | Command                        |
| -------------------------------------------------- | ------------------------------ |
| [Add a module](/docs/recipes/add-a-module)         | `vpr gen:module <name>`        |
| [Add a page](/docs/recipes/add-a-page)             | `vpr gen:page <module> <name>` |
| [Add a theme](/docs/recipes/add-a-theme)           | `vpr gen:theme <name>`         |
| [Add a component](/docs/recipes/add-a-component)   | `vpr gen:component <Name>`     |
| [Add an icon set](/docs/recipes/add-an-icon-set)   | `vpr gen:icon-set <name>`      |
| [Add a locale](/docs/recipes/add-a-locale)         | — by hand                      |
| [Add a permission](/docs/recipes/add-a-permission) | — by hand                      |
| [Add a nav group](/docs/recipes/add-a-nav-group)   | — by hand                      |

Every generator supports:

| Flag        | Effect                                             |
| ----------- | -------------------------------------------------- |
| `--dry-run` | Print the files and registry edits; write nothing. |
| `--json`    | The same plan, machine-readable.                   |
| `--force`   | Overwrite files that already exist.                |

`vpr gen` with no arguments lists everything.

## Why some tasks have no generator

Adding a locale is mostly translating; a tool that emitted 1,100 placeholder
strings would manufacture the appearance of a finished translation. Adding a
permission is an access-control decision. Adding a nav group is three lines in
one file.

A generator earns its place when the work is _mechanical and spread across files
you would forget_. Where it is neither, the recipe is the deliverable.

## The gates behind them

Generated or hand-written, the same checks apply — which is the point. `vp check`
runs formatting, lint (including boundary rules), and types;
`node scripts/lint/run-custom-rules.mjs` adds i18n parity, icon parity, theme
registry consistency and the state/palette rules; `vpr test --run` includes
`test/unit/architecture/`, which asserts the module contract itself.

Nothing here depends on having used a generator.
