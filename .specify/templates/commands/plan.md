---
description: Create a technical implementation plan in specs/NNN-feature-name/plan.md from an existing spec.
argument-hint: "[tech stack notes or constraints, e.g. 'use Pinia store, no layout changes']"
---

## Goal

Generate a complete `plan.md` for the current feature spec. The plan translates user stories and requirements into a concrete technical approach, constitution compliance check, affected file map, and risk register.

## When to use

- After `spec.md` exists and is reviewed.
- Before breaking work into tasks.

## Procedure

1. Read `specs/NNN-feature-name/spec.md` (required).
2. Read `.specify/memory/constitution.md` (required — plan must reference it).
3. Read `.specify/templates/plan-template.md` as the structural reference.
4. Generate `specs/NNN-feature-name/plan.md` with:
   - Metadata header: `**Branch** | **Date** | **Spec**: link`
   - **Summary**: one paragraph of the approach and key trade-offs
   - **Technical Context**: stack, affected area, constraints
   - **Constitution Check**: table mapping every principle to ✅/⚠/❌ with notes; ⚠ requires Complexity Tracking justification
   - **Project Structure**: spec artifacts tree AND source files affected (with reason per file)
   - **Technical Direction**: plain-language approach with actual file paths
   - **Risks**: table of risks and mitigations
   - **Complexity Tracking**: fill ONLY for ⚠ constitution violations
5. Report: created file path, constitution check summary, any violations that need justification.

## Constraints

- Do NOT write code in plan.md — only file paths and plain-language descriptions.
- The Constitution Check section is MANDATORY — an incomplete check is a plan failure.
- Do NOT reference files outside the Vuestrata layer boundaries (see constitution Principle IV).
- Complexity Tracking remains empty unless there is a genuine ⚠ in the Constitution Check.
