---
description: Generate an actionable tasks.md for the feature from spec.md and plan.md.
argument-hint: "[optional focus, e.g. 'include test tasks' or 'P1 stories only']"
---

## Goal

Generate `tasks.md` for the current feature by deriving sequential, dependency-ordered tasks from the user stories in `spec.md` and the technical approach in `plan.md`.

## When to use

- After both `spec.md` and `plan.md` exist and are reviewed.
- Before beginning implementation.

## Procedure

1. Read `specs/NNN-feature-name/spec.md` — extract user stories with priorities.
2. Read `specs/NNN-feature-name/plan.md` — extract affected files, risks, constraints.
3. Read `.specify/templates/tasks-template.md` as the structural reference.
4. Generate `specs/NNN-feature-name/tasks.md` with:
   - **Phase 1: Setup** — audit / scaffolding tasks, no story label
   - **Phase 2: Foundational** — blocking prerequisites for all user stories, no story label
   - **Phase 3+**: One phase per user story in priority order (P1 first), each task labelled `[USN]`
   - **Polish phase** — `vp check`, `vpr test --run`, `vpr build`
   - **Dependencies & Execution Order** — ASCII graph of task dependencies
5. Every task must follow the strict format: `- [ ] T001 [P?] [Story?] Description with exact file path`
6. Mark tasks `[P]` only if they touch different files with no dependencies on incomplete tasks.
7. Report: number of tasks generated, phase breakdown, any parallelizable groups identified.

## Task Format Rules

```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

- **Checkbox**: ALWAYS `- [ ]`
- **Task ID**: Sequential `T001`, `T002`… in execution order
- **[P]**: ONLY if parallelizable
- **[Story]**: REQUIRED for user-story phases (`[US1]`, `[US2]`…); omit for setup/foundational/polish
- **Description**: action verb + exact file path

## Constraints

- Tests are OPTIONAL — include test tasks only if the spec or argument explicitly requests TDD.
- Do NOT keep template sample tasks — replace ALL placeholder tasks with real tasks.
- Each user story phase must end with a verifiable checkpoint statement.
- Do NOT create tasks for generated files (`auto-imports.d.ts`, `components.d.ts`, `typed-router.d.ts`).
