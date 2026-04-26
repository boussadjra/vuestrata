# speckit-implement Skill

Use to execute the next ready task from a feature task list.

## Rules

1. Read `.specify/specs/NNN-feature/tasks.md`.
2. Pick the first incomplete task whose dependencies are complete.
3. Read the linked plan context.
4. Implement exactly one task.
5. Run required quality gates before marking it complete.
6. If blocked, report the blocker instead of skipping ahead.
