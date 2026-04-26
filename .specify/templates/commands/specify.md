---
description: Create a new feature specification in specs/NNN-feature-name/spec.md using the spec template.
argument-hint: '[describe what you want to build or fix in plain language]'
---

## Goal

Create a new brownfield feature specification for the Vuestrata project. The spec captures the problem, goals, user stories with priorities, functional requirements, non-functional requirements, and edge cases.

## When to use

- Starting any non-trivial new feature, refactor, or bug-fix that touches more than one file or changes user-facing behavior.
- When you need to define scope before writing any code.

## Procedure

1. Read `.specify/memory/constitution.md` to understand the project principles.
2. Read `.specify/templates/spec-template.md` as the structural reference.
3. Determine the next spec number by listing `specs/` directory (highest NNN + 1).
4. Create `specs/NNN-feature-name/spec.md` from the template, filled with:
   - Problem statement derived from the argument
   - Goals and explicit Non-Goals
   - User Stories with priorities (P1 = MVP-critical, P2 = important, P3 = nice-to-have)
   - Acceptance Criteria per user story
   - Functional Requirements table (R1, R2…)
   - Non-Functional Requirements
   - Edge Cases
5. Set `**Status**: Draft` in the metadata header.
6. Report the created file path and a summary of user stories identified.

## Constraints

- All user stories must have explicit priorities (P1/P2/P3).
- Non-Goals must be explicitly listed — never omit this section.
- Do NOT include implementation details or file paths in `spec.md` — that belongs in `plan.md`.
- Do NOT start with a broad ambiguous spec — ask a clarifying question first if the argument is underspecified.
