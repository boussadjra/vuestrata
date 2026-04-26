---
name: vuestrata-module-organization
description: Use when deciding where new files belong and how module boundaries should be preserved.
argument-hint: 'what you are adding or reorganizing'
---

# Vuestrata Module And File Organization

Use this skill when placing new code.

## Placement Rules

- shell UI: `src/components/layout/`
- consumer UI wrappers: `src/components/ui/`
- provider internals: `src/components/ui/provider/<provider>/`
- framework-agnostic logic: `src/lib/`
- reusable Vue behavior: `src/composables/`
- global state: `src/stores/`
- app config: `src/config/`
- docs markdown: `docs/`
- docs-rendering components: `src/components/docs/`

## Module Rules

1. New ecommerce features should stay self-contained under `src/modules/<module>/`.
2. Register modules centrally and respect dependency ordering.
3. Do not scatter module files across unrelated top-level folders or mix provider internals with consumer wrappers.
