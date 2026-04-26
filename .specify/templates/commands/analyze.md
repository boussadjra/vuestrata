---
description: Perform a cross-artifact consistency analysis across spec.md, plan.md, and tasks.md before implementation.
argument-hint: "[optional focus area, e.g. 'constitution compliance' or 'task IDs']"
---

## Goal

Identify inconsistencies, duplications, ambiguities, and underspecified items across `spec.md`, `plan.md`, and `tasks.md` before implementation begins.

## When to use

- After `tasks.md` is generated and before starting implementation.
- When something feels inconsistent between the three artifacts.

## Operating Constraints

**STRICTLY READ-ONLY**: Do NOT modify any files. Output a structured analysis report only.

**Constitution authority**: `.specify/memory/constitution.md` is non-negotiable. Constitution conflicts are automatically CRITICAL and require adjustment of spec/plan/tasks — not silent ignoring.

## Procedure

1. Read `specs/NNN-feature-name/spec.md` — extract user stories, requirements, acceptance criteria.
2. Read `specs/NNN-feature-name/plan.md` — extract constitution check, affected files, technical direction.
3. Read `specs/NNN-feature-name/tasks.md` — extract task IDs, phases, file paths, dependencies.
4. Read `.specify/memory/constitution.md` — validate all three artifacts against principles.
5. Produce a structured analysis report with:
   - **CRITICAL**: Constitution violations, missing acceptance criteria, tasks with no spec reference
   - **WARNING**: Uncovered user stories, files in plan but not in tasks, ambiguous task descriptions
   - **INFO**: Suggestions for parallelization, missing edge cases
6. Do NOT make changes. Offer a recommended remediation list for user approval.

## Analysis Checklist

- [ ] Every user story in `spec.md` has at least one task in `tasks.md`
- [ ] Every affected file in `plan.md` appears in at least one task
- [ ] Every task has an exact file path (no vague descriptions)
- [ ] Constitution Check in `plan.md` is complete (no missing principles)
- [ ] No constitution ⚠ without a Complexity Tracking justification
- [ ] Dependencies graph in `tasks.md` is consistent with task phase order
- [ ] Polish phase includes `vp check`, `vp test --run`, and `vp build`
