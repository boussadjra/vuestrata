---
description: Create or update the Vuestrata project constitution at .specify/memory/constitution.md.
argument-hint: "[one-line description of the principle change or 'initial setup']"
---

## Goal

Create or update `.specify/memory/constitution.md` for the Vuestrata project. The constitution is the non-negotiable source of architectural principles that all specs, plans, and tasks must reference.

## When to use

- Starting a new spec cycle and the constitution needs a version bump.
- Adding, removing, or rewording a principle.
- After a significant architectural decision that should be encoded as a new principle.

## Procedure

1. Read `.specify/memory/constitution.md` if it exists.
2. Read `.specify/templates/constitution-template.md` as the structural reference.
3. Apply the argument as the change intent (or initialize from template if missing).
4. Ensure the constitution has:
   - A `# [Project Name] Constitution` heading
   - A version comment: `<!-- Version: X.Y.Z | Ratified: YYYY-MM-DD | Last amended: YYYY-MM-DD -->`
   - `## Core Principles` section with numbered Roman-numeral principles (each with a short title and a paragraph of non-negotiable rules)
   - `## Governance` section with amendment procedure, versioning policy, and compliance review
5. Bump version appropriately: patch for wording, minor for added/removed principles, major for breaking changes to existing specs.
6. Write the updated file back to `.specify/memory/constitution.md`.
7. Report: version change, modified principles, follow-up TODOs.

## Constraints

- Do NOT remove or dilute principles without explicit user instruction.
- Principles must be declarative and testable — replace vague "should" with MUST/SHOULD with rationale.
- The Governance section is mandatory — do not omit it.
