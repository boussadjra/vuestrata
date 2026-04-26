---
name: speckit-implement
description: Execute the next ready task from a feature task list and update its status.
---

# speckit-implement

Use when ready to implement the next task.

## Instructions

1. Read `.specify/templates/commands/implement.md` and the feature task list.
2. Pick the first incomplete task whose dependencies are complete.
3. Implement exactly one task.
4. Run its required quality gates.
5. Mark it complete only after verification.
6. If blocked, report the blocker instead of skipping ahead.
