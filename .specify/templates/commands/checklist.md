---
description: Generate a custom quality checklist for validating requirements completeness and clarity before implementation.
argument-hint: "[checklist focus, e.g. 'security', 'review', 'deploy', 'ux']"
scripts:
  ps: scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly
---

## Goal

Generate a "unit tests for requirements" checklist that validates the current spec's completeness, internal consistency, and readiness for implementation. The checklist is stored in the feature directory.

## When to use

- After `/speckit.specify` and optionally `/speckit.clarify` to validate spec quality.
- Before `/speckit.plan` to catch requirement gaps early.
- When the user wants a domain-specific quality checklist (security, UX, deploy, etc.).

## Procedure

1. Run `{SCRIPT}` from repo root and parse JSON for FEATURE_DIR and AVAILABLE_DOCS.
2. Read `FEATURE_DIR/spec.md` (required).
3. If `FEATURE_DIR/plan.md` exists, read it for additional technical context.
4. Determine checklist theme from the argument (default: `requirements`).
5. Generate checklist items organized into categories:
   - **Completeness**: Every user story has acceptance criteria; every requirement is testable
   - **Consistency**: No contradictions between user stories; requirements don't conflict
   - **Clarity**: No vague language ("should", "might", "etc."); specific metrics where applicable
   - **Edge cases**: Boundary conditions identified; error scenarios documented
   - **Domain-specific** (based on theme):
     - `security`: auth, input validation, data exposure, OWASP concerns
     - `ux`: accessibility, responsiveness, error states, loading states
     - `deploy`: env variables, backwards compatibility, rollback plan
     - `review`: code quality, test coverage, documentation completeness
6. Create `FEATURE_DIR/checklists/` directory if it doesn't exist.
7. Write checklist to `FEATURE_DIR/checklists/<theme>.md` using checkbox format:

   ```markdown
   # Quality Checklist: [FEATURE] — [Theme]

   ## Completeness

   - [ ] Every user story has measurable acceptance criteria
   - [ ] ...

   ## Consistency

   - [ ] ...
   ```

8. Report: file path, number of checklist items, categories covered.

## Constraints

- Checklist items must be verifiable — each item is a yes/no check, not a task.
- Do NOT modify `spec.md`, `plan.md`, or `tasks.md`.
- Do NOT generate checklist items for features/requirements not in the spec.
- Maximum ~30 items per checklist — be focused, not exhaustive.
- If no argument is provided, default theme is `requirements`.
