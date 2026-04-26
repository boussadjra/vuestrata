---
name: vuestrata-auth-contract-checks
description: Use when auth changes could create drift between runtime, env keys, mocks, UI copy, and docs.
argument-hint: 'auth flow or contract to verify'
---

# Vuestrata Auth Contract Checks

Use this skill when auth work could introduce contract drift.

## Check

- canonical auth env key usage
- adapter selection in runtime, docs, and `.env.example`
- `useAuth()` flows: login, register, logout, current user, refresh, social, magic link
- mock handlers and auth pages
- auth-related tests and docs

## Rules

1. Audit `src/composables/useAuth.ts`, `src/config/app.config.ts`, `src/mocks/handlers.ts`, auth pages, `.env.example`, `README.md`, and `docs/6.configuration/`.
2. Treat env-key or adapter-name drift as a regression.
3. Fix the source of drift, not just the docs.
4. Do not finish auth work unless runtime, tests, mocks, env examples, and docs agree.
