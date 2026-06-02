# Copilot Instructions

## Workflow

- Implement directly with clear scope; use concise change notes for non-trivial work.
- Use targeted planning only when needed for risky or cross-cutting changes.
- Preserve existing behavior unless an approved implementation decision changes the contract.
- Read `.specify/memory/constitution.md` before major implementation; it is the highest authority.
- Use matching workspace skills in `.github/skills/` and helper scripts in `.specify/scripts/powershell/` when applicable.

## Tooling

- Use the `vp` CLI (Vite Plus) for all commands; do not use `pnpm`, `npm`, `yarn`, or `bun` directly.
- Prefer built-in commands over ad hoc: `vp check`, `vp lint`, `vp fmt --check`, `vp test --run`, `vp run test:e2e`, `vp build`.
- Use `vp run <script>` for custom package.json scripts that share a name with built-in commands.
- Do not call non-existent wrappers like `vp vitest` or `vp oxlint`; use `vp test` and `vp lint`.
- Do not install wrapped tools directly (Vitest, Oxlint, Oxfmt, tsdown); use Vite+ commands.
- For one-off binaries, prefer `vp dlx` over package-manager-specific `npx`/`dlx`.
- Import JS modules from `vite-plus` (and `vite-plus/test`) instead of `vite` or `vitest`.
- Do not introduce parallel tooling unless a spec explicitly requires it.

## Repo Priorities

- Keep runtime state single-sourced and docs/env/runtime aligned.
- Keep UI consumers on provider-agnostic `Ui*` wrappers, not provider internals.
- Respect module registration, dependency ordering, enable/disable flow, and persistence.
- Keep tests close to behavior changes.

## State Ownership Policy (enforced)

The `module-scope-state` custom lint rule (`scripts/lint/plugins/module-scope-state.plugin.mjs`) hard-fails on module-scope mutable state in `src/**`. When generating or editing code:

- Use `createGlobalState(...)` (VueUse, auto-imported) for simple shared singletons (registries, caches, lookup maps). Place under `src/modules/app/state/`.
- Use `defineStore(...)` (Pinia) for complex client orchestration with multiple actions, devtools, or persistence. Place under `src/modules/app/stores/` or a module's `stores/`.
- Use TanStack Query composables for server state.
- Use the typed event bus (`src/modules/core/lib/events.ts`) for cross-module pub/sub.
- Never declare top-level `let`, `new Map/Set/WeakMap/WeakSet` (other than `SCREAMING_SNAKE_CASE` constant lookups), or unwrapped reactivity calls (`ref`/`reactive`/`computed`/`watch`/`watchEffect`/`useStorage`/`useAppStorage`/`shallowRef`/`shallowReactive`) at module scope. Wrap them in `defineStore(...)` or `createGlobalState(...)`.
- `src/modules/core/lib/` must stay framework-agnostic. Cross-cutting services it needs go through interfaces + injection slots in `src/modules/core/lib/runtime.ts`, with concrete backends installed by `installRuntimeBackends()` in `src/modules/app/state/runtime-backends.ts`.
- Allowlisted files: `src/modules/core/lib/events.ts`, `src/modules/core/lib/runtime.ts`. One-off escape: `// lint-allow-module-scope-state` on the offending line, with justification.
- Tests must use `resetRuntimeState()` (already wired in `test/setup.ts` `beforeEach`) instead of per-file `clearXxx()` helpers.

## Structure

- Preserve the current top-level layout under `src/`.
  - Use `src/modules/app/components/layout/` for shell UI, `src/modules/app/components/ui/` for consumer wrappers, `src/modules/app/components/ui/provider/<provider>/` for provider internals, and `src/modules/core/lib/` for framework-agnostic logic.
- Keep app features self-contained under `src/modules/<module>/`.
  - Keep docs markdown in `docs/` and docs-rendering components in `src/modules/app/components/docs/`.

## Quality Gates

- Before finishing non-trivial work, run the smallest useful verification set: typecheck, focused tests, then build when wiring changes.
- Leave no known diagnostics in touched files; verify with `vp lint` and `vp check` before finishing.
- Fix root causes instead of masking integration issues.
- If dependencies, scripts, CI, or containers change, validate that path in the same change.

## Agent Checklist

- Run `vp install` after pulling remote changes and before getting started.
- Run `vp check` and `vp test` to validate changes (or a justified focused subset).

## Planning Notes

- Use lightweight implementation notes for non-trivial changes instead of mandatory spec folder scaffolding.
- Templates remain available under `.specify/templates/` if structured documentation is needed.
- Keep docs and runtime behavior aligned in the same change.

## Skills

- Domain skills: `vuestrata-spec-workflow`, `vuestrata-quality-gates`, `vuestrata-module-organization`, `vuestrata-docs-parity`, `vuestrata-auth-contract-checks`.
