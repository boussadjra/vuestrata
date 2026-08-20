---
description: Scaffold a new CRUD domain module
argument-hint: <name> [--entity <singular>] [--nav-group <id>] [--icon <name>]
---

Scaffold a domain module named `$ARGUMENTS`.

1. Preview first: `vpr gen:module $ARGUMENTS --dry-run`
2. If the plan looks right, run it without `--dry-run`.
3. Read `docs/9.recipes/1.add-a-module.md` for what the generator deliberately
   leaves to you.
4. Replace the placeholder schema in `src/modules/<name>/types.ts` with the real
   domain shape — everything else in the module derives from it.
5. Verify: `vp check && vpr test --run`

Do not hand-write the module files or the `setup.ts` / `BuiltinPermission`
registry entries; the generator handles those and forgetting them fails silently.
