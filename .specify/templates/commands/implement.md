---
description: Execute the tasks in tasks.md phase by phase to implement the feature.
argument-hint: "[optional phase number or task ID to start from, e.g. 'Phase 3' or 'T008']"
---

## Goal

Implement the current feature by executing tasks from `tasks.md` in correct dependency order.

## When to use

- After `spec.md`, `plan.md`, and `tasks.md` all exist.
- When starting or resuming implementation of a spec.

## Procedure

1. Read `specs/NNN-feature-name/tasks.md` — parse all phases and tasks.
2. Read `specs/NNN-feature-name/plan.md` — load affected files list and technical direction.
3. Read `.specify/memory/constitution.md` — confirm no implementation decision violates a principle.
4. If an argument is provided, start from the specified phase or task ID; otherwise start from Phase 1.
5. For each phase:
   a. Announce the phase and its purpose.
   b. Execute tasks in order; for `[P]`-marked tasks, handle them together where file independence allows.
   c. After each user-story phase, verify the checkpoint condition stated in `tasks.md`.
6. On completing all tasks, run the polish phase: `vp check && vpr test --run && vpr build`.
7. Report: tasks completed, any remaining open tasks, constitution compliance confirmation.

## Constraints

- Do NOT skip the polish phase, even for small changes.
- Do NOT edit generated files (`auto-imports.d.ts`, `components.d.ts`, `typed-router.d.ts`).
- Do NOT use `// @ts-ignore`, `/* oxlint-disable */`, or other suppression directives as a substitute for fixing the root cause.
- MUST leave touched files with zero known editor diagnostics.
- Use `vp` — never `pnpm`, `npm`, `yarn`, or `bun` directly.
