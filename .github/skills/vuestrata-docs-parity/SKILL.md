---
name: vuestrata-docs-parity
description: Use when code changes could make README, docs, env examples, or UI copy inaccurate.
argument-hint: 'feature, page, claim, or contract to verify'
---

# Vuestrata Docs And Claims Parity

Use this skill when implementation changes product claims.

## Check

- `README.md`
- `docs/`
- `.env.example`
- settings and navigation copy
- feature lists and architecture descriptions

## Rules

1. Find every user-facing mention of the changed claim.
2. Update code, docs, env examples, and labels in the same change.
3. Remove stale or aspirational wording.
4. Tie non-trivial documentation drift back to the relevant spec in `.specify/specs/`.
