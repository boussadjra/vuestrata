---
description: Identify underspecified areas in the current feature spec by asking up to 5 targeted clarification questions and encoding answers back into the spec.
argument-hint: "[optional focus area to clarify, e.g. 'auth flows' or 'performance requirements']"
scripts:
  ps: scripts/powershell/check-prerequisites.ps1 -Json -PathsOnly
---

## Goal

Find underspecified or ambiguous areas in `spec.md` and resolve them through focused clarification questions. Answers are encoded back into the spec.

## When to use

- After `/speckit.specify` when the spec contains `[NEEDS CLARIFICATION]` markers.
- When the plan step raises blockers due to vague requirements.
- When the user wants to tighten scope before planning.

## Procedure

1. Run `{SCRIPT}` from repo root and parse JSON for FEATURE_DIR.
2. Read `FEATURE_DIR/spec.md` fully.
3. Identify up to 5 underspecified areas, prioritized by:
   - **Scope impact** (ambiguity that changes the number of user stories or requirements)
   - **Security/privacy** (unclear data handling, access control)
   - **User experience** (unclear interaction patterns, edge cases)
   - **Technical feasibility** (ambiguous constraints)
4. For each area, formulate one targeted question with:
   - Context: quote the ambiguous section
   - Options: list 2–3 reasonable interpretations
   - Default: recommend the most likely answer with a brief rationale
5. Present all questions to the user at once.
6. After receiving answers, update `spec.md`:
   - Replace `[NEEDS CLARIFICATION]` markers with concrete decisions
   - Add an `## Assumptions` section (or append to it) documenting each decision
   - Do NOT change existing acceptance criteria unless the answer explicitly invalidates them
7. Report: number of clarifications resolved, any remaining `[NEEDS CLARIFICATION]` markers.

## Constraints

- Maximum 5 questions per invocation — do not overwhelm the user.
- Never invent requirements — only resolve existing ambiguity.
- If the spec is already well-specified, report that and exit without changes.
- Do NOT modify `plan.md` or `tasks.md` — those are separate steps.
