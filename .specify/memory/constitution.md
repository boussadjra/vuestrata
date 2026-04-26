# Vuestrata Constitution

<!-- Version: 1.6.0 | Ratified: 2026-03-09 | Last amended: 2026-04-13 -->

## Core Principles

### I. Direct Execution With Explicit Scope

Work should ship directly in code with a clear, bounded scope. Use concise implementation notes in PR descriptions, commit messages, or docs when the change is non-trivial. Do not require spec boilerplate directories as a prerequisite for delivery.

### II. Brownfield Safety First

Preserve current behavior, public APIs, and repository shape unless an approved spec changes the contract.

### III. Vite Plus Toolchain Is Mandatory

Use the `vp` CLI (Vite Plus) for all development commands. Reuse built-in commands: `vp check`, `vp lint`, `vp fmt --check`, `vp test --run`, `vp run test:e2e`, `vp build`. Use `vp run <script>` for custom package.json scripts that share names with built-ins. Do not use `pnpm`, `npm`, `yarn`, or `bun` directly — Vite Plus wraps the underlying package manager. Do not run non-existent wrappers such as `vp vitest` or `vp oxlint`; use `vp test` and `vp lint`. Do not install wrapped tools directly (for example Vitest, Oxlint, Oxfmt, tsdown) just to invoke them. Import JavaScript modules from `vite-plus` (for example `vite-plus` and `vite-plus/test`) instead of `vite` or `vitest`. Use `vp dlx` instead of package-manager-specific `npx` or `dlx`. Do not add parallel tooling such as Cypress, legacy PostCSS-era config, or duplicate lint/format stacks.

### IV. Organize By Layer And Module

Keep UI wrappers in `src/components/ui/`, provider internals in `src/components/ui/provider/`, shell layout in `src/components/layout/`, framework-agnostic logic in `src/lib/`, and app features self-contained under `src/modules/<name>/`.

### V. Single Source Of Truth

Runtime config, persisted settings, env contracts, and user-facing claims must not drift across stores, composables, config, and docs. New work must reduce duplication, not extend it.

### VI. Claims Must Match Reality

README, docs, settings, env keys, and runtime behavior are one surface. If implementation changes a claim, update the claim in the same change.

### VII. Verify The Smallest Useful Slice

Each phase defines explicit validation. Default order: typecheck, focused tests, then build when runtime wiring changes.

### VIII. AI Assistance Must Stay Legible

Specs, plans, tasks, and instructions must stay human-readable, auditable, and free of known diagnostics in touched files.

### IX. Clean Code And Readability

Prefer clear names, small focused units, shallow nesting, explicit behavior, and deleted dead code. Readability is a feature.

### X. SOLID By Judgment, Not By Ceremony

Apply SOLID where it reduces coupling or clarifies ownership. Keep adapters extensible, implementations substitutable, interfaces narrow, and `src/lib/` independent from Vue UI layers. Do not invent abstractions before a second real use case exists.

### XI. Design Patterns Where They Earn Their Keep

Use patterns only to solve demonstrated problems. Extend existing adapter/strategy and factory patterns when useful; avoid extra indirection such as custom event buses, abstract factories for one implementation, or decorator chains that add no clarity.

### XII. Intuitive And Modern UX

Prefer clarity, predictable navigation, visible states, inline validation, explicit loading/empty/error states, and progressive disclosure over novelty.

### XIII. Responsive Design As Default

Every page and component must work on mobile, tablet, and desktop. Use Tailwind responsive utilities, keep touch targets usable, and adapt navigation, tables, and modals for small screens.

### XIV. Minimal Dependencies

Every dependency must justify bundle cost, maintenance, and uniqueness. Prefer existing repo capabilities or small `src/lib/` utilities when practical. Keep the lockfile authoritative and remove orphan dependencies with the feature that made them obsolete.

### XV. Test Every Layer, Test With Purpose

Testing is mandatory. Use unit tests for pure logic and stores, component tests for rendering and contracts, integration tests for composed behavior, and Playwright for critical journeys. Ship behavior changes with matching tests, assert outcomes over internals, and fix or remove flaky tests immediately.

### XVI. Declarative Data Fetching With TanStack Query

Use `@tanstack/vue-query` for server state. `ofetch` remains the low-level HTTP client in `src/lib/api/client.ts`, but composables should use `useQuery` and `useMutation` with typed `[module, resource, ...params]` keys instead of manual loading/error/caching state.

### XVII. Document Every New Feature

Every new feature, component, composable, or module must ship with matching documentation in `docs/`. If a feature adds user-facing behavior, update or create the relevant docs page in the same change. Documentation is not a follow-up task — it is part of the definition of done.

### XVIII. Provider Independence And Shared Base Components

Each UI provider directory (`src/components/ui/provider/<provider>/`) MUST be self-contained. A provider component MUST NOT import or delegate to another provider's components — e.g., `V0*` MUST NOT import `Reka*` and vice-versa. Cross-provider imports break the adapter contract and make providers non-substitutable. When multiple providers share identical logic (Formwerk composable wiring, prop interfaces, computed state), that logic MUST be extracted into shared base composables or renderless components under `src/components/ui/base/` so each provider composes from the shared base independently.

## Governance

### Versioning Policy

- **Patch**: wording, grammar, formatting, or compression with no policy change.
- **Minor**: add, remove, or materially extend a principle.
- **Major**: change that invalidates existing specs, plans, or tasks and requires a backlog audit.

### Amendment Log

| Version | Date       | Change                                                                                                             |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.0.0   | 2026-03-09 | Initial ratification with principles I–VIII                                                                        |
| 1.1.0   | 2026-03-09 | Added principles IX–XVI: clean code, SOLID, patterns, UX, responsive design, minimal deps, testing, TanStack Query |
| 1.1.1   | 2026-03-10 | Compressed wording to reduce instruction-token footprint without changing policy                                   |
| 1.2.0   | 2026-03-16 | Added principle XVII: Document Every New Feature                                                                   |
| 1.3.0   | 2026-03-21 | Added principle XVIII: Provider Independence And Shared Base Components                                            |
| 1.4.0   | 2026-04-11 | Updated principle III: Migrated from pnpm to Vite Plus (`vp`) toolchain                                            |
| 1.5.0   | 2026-04-13 | Replaced mandatory spec-first principle with direct-execution scope policy and aligned module wording              |
| 1.6.0   | 2026-04-13 | Expanded principle III with Vite+ pitfalls, wrapper/import rules, and tool invocation constraints                  |

### Compliance Review

- Every architecture-affecting change must include a short scope/impact note in PR description, docs, or commit message.
- PRs must confirm any exception explicitly.
- AI agents must read this file before major implementation and must flag policy conflicts instead of silently violating them.
- Agents SHOULD run `vp install` after pulling remote changes and before starting work.
- Before completion, agents SHOULD validate with `vp check` and `vp test` (or the smallest justified focused subset).
