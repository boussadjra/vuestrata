# Implementation Plan: Demo-First Auth Mocking With IndexedDB Persistence

**Branch**: `001-demo-auth-indexeddb` | **Date**: 2026-04-26 | **Spec**: [`spec.md`](./spec.md)
**Input**: `.specify/specs/001-demo-auth-indexeddb/spec.md`

## Summary

Complete the demo auth surface so every flow (credentials, social, magic link, OAuth callback, MFA, logout, session restore, refresh) runs end-to-end inside the browser, backed by an app-shared IndexedDB infrastructure for demo user and session envelopes with a configurable 24-hour TTL. Reuse the existing `useAuth` orchestrator and RBAC engine — no new auth abstraction. Add the missing MSW handlers (`/auth/me`, `/auth/logout`, `/auth/refresh`, `/auth/token`, `/api/auth/{provider}`, `POST /users`, `PATCH /users/:id/permissions`), promote the demo user to `super_admin` with explicit full permissions, and surface invite + per-user permission assignment in the users page. Storage uses a shared app persistence wrapper with `{version, createdAt, expiresAt, integrityHash, payload}` envelope and BroadcastChannel cross-tab invalidation, consumed by auth and users modules. Docs are updated in the same change.

## Technical Context

- **Stack**: Vue 3.5+, TypeScript strict, Pinia, Vue Router, TanStack Query, MSW, ofetch, jwt-decode, Vite Plus.
- **Affected area**: `src/modules/auth/**`, `src/modules/app/{stores,mocks,state,composables}/**`, `src/modules/users/**`, `src/modules/core/lib/rbac/**` (read-only verify), `src/main.ts`, `src/config/app.config.ts`, `docs/**`.
- **Constraints**:
  - Preserve `useAuth` orchestrator shape and adapter pattern; do not introduce a fourth adapter or duplicate flow logic.
  - No new top-level mutable module state — use `createGlobalState` or Pinia per `module-scope-state` rule.
  - `src/modules/core/lib/` stays framework-agnostic; IndexedDB lives in shared app infrastructure under `src/modules/app/state/`, and feature modules consume it.
  - `vp` toolchain only; import test utilities from `vite-plus/test`.
  - No new dependency unless `idb` is needed; first attempt with a small native IndexedDB wrapper in `src/modules/app/state/demo-persistence.ts`.

## Constitution Check

| Principle                     | Status | Notes                                                                                                                           |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| I. Direct Execution Scope     | ✅     | Spec is bounded; plan keeps scope to auth demo + persistence + docs.                                                            |
| II. Brownfield Safety         | ✅     | `useAuth`, RBAC engine, route guard, and store public API are preserved. Only mocks, persistence, and seed data change.         |
| III. Vite Plus Toolchain      | ✅     | All commands via `vp`; tests imported from `vite-plus/test`.                                                                    |
| IV. Layer/Module Organization | ✅     | Shared persistence infrastructure in `src/modules/app/state/`; auth/users modules consume it; UI stays in `src/modules/users/`. |
| V. Single Source Of Truth     | ✅     | Retention TTL lives in one config key; demo user seed lives in one fixture; permissions resolved by existing RBAC engine.       |
| VI. Claims Match Reality      | ✅     | Docs (`auth-rbac`, `auth-deep-dive`, `built-in-modules`, `environment`, `configuration`) updated in same change.                |
| VII. Smallest Useful Slice    | ✅     | Phased delivery; each phase ends with a focused `vp check` + targeted `vp test --run` gate.                                     |
| VIII. AI Legibility           | ✅     | Plan references real paths; no pseudocode in spec; tasks.md will enumerate work items.                                          |
| IX–XI Clean code / SOLID      | ✅     | Reuse existing adapter; no new abstraction before second consumer.                                                              |
| XII–XIII UX / Responsive      | ✅     | Invite + permissions UI built on existing `Ui*` wrappers; mobile-first patterns reused.                                         |
| XIV. Minimal Dependencies     | ⚠      | Add `idb` only if native wrapper proves brittle; default plan ships zero new deps. See Complexity Tracking.                     |
| XV. Testing                   | ✅     | Unit (envelope/expiry/integrity), component (users page invite + permission matrix), integration (session restore).             |
| XVI. TanStack Query           | ✅     | New `POST /users` and `PATCH /users/:id/permissions` exposed via `useMutation` with typed keys.                                 |
| XVII. Document Every Feature  | ✅     | Docs updates are part of definition of done (Phase 7).                                                                          |
| XVIII. Provider Independence  | ✅     | No provider-internal imports; users page uses `Ui*` wrappers only.                                                              |

## Project Structure

### Documentation (this feature)

```text
.specify/specs/001-demo-auth-indexeddb/
├── spec.md
├── plan.md      # this file
└── tasks.md     # generated from plan
```

### Source files affected

```text
src/
├── modules/app/
│   ├── state/
│   │   ├── demo-persistence.ts             # NEW — minimal typed IndexedDB wrapper (open/get/put/delete/clear)
│   │   ├── demo-storage.ts                 # NEW — shared envelope + integrity + TTL + BroadcastChannel invalidation
│   │   ├── demo-store.ts                   # NEW — shared typed accessors for users[] and session{} stores
│   │   ├── runtime-backends.ts             # EXTEND — register shared demo storage backend; seed full-permission super_admin on first run
│   │   └── demo-auth-backend.ts            # NEW — createGlobalState wrapper exposing shared demo-store to feature modules
│   ├── stores/auth.ts                      # MINIMAL EDIT — accept and expose user.permissions; persist nothing new (envelope owned by shared demo-storage)
│   ├── composables/useRbac.ts              # VERIFY — already supports user.permissions override
│   ├── mocks/
│   │   ├── fixtures/users.ts               # EDIT — demo@vuestrata.dev becomes super_admin with explicit full permissions[]
│   │   ├── handlers/users.ts               # EXTEND — add POST /users, PATCH /users/:id/permissions; persist via shared demo-store
│   │   └── utils.ts                        # MINIMAL EDIT — accept user.permissions when minting JWT claims
├── modules/auth/
│   ├── mocks/
│   │   └── auth.handlers.ts                # EXTEND — add /auth/me, /auth/logout, /auth/refresh, /auth/token, /api/auth/{provider}; back all flows by shared demo-store
│   ├── composables/
│   │   └── useAuth.ts                      # MINIMAL EDIT — exchangeOAuthCode/socialLogin go through mocked /auth/token
│   └── pages/callback.vue                  # VERIFY — works against new mocked /api/auth/{provider}/callback path
├── modules/users/
│   ├── pages/users.vue                     # EDIT — wire invite button to modal; add per-user permissions panel
│   ├── components/InviteUserDialog.vue     # NEW — form-driven add-user via Ui* wrappers
│   ├── components/UserPermissionsPanel.vue # NEW — checkbox matrix backed by RBAC registry
│   ├── composables/useInviteUserMutation.ts        # NEW — POST /users
│   └── composables/useUpdatePermissionsMutation.ts # NEW — PATCH /users/:id/permissions
├── config/app.config.ts                    # EXTEND — add VUESTRATA_DEMO_AUTH_RETENTION_HOURS (default 24)
└── main.ts                                 # MINIMAL EDIT — restoreSession runs for mock adapter when shared demo-storage holds a valid envelope

test/
├── unit/app/demo-storage.test.ts           # NEW — envelope, expiry, integrity-fail, corrupt JSON
├── unit/app/demo-store.test.ts             # NEW — CRUD, version mismatch, broadcast invalidation
├── component/users/users-page.test.ts      # NEW — invite + permission assignment flows
├── integration/auth/session-restore.test.ts# NEW — reload restores demo session within TTL; clears after expiry
└── stores.test.ts                          # EDIT — auth store exposes user.permissions

docs/
├── 6.configuration/2.auth-rbac.md          # EDIT — describe demo flow coverage and per-user permissions
├── 6.configuration/3.auth-deep-dive.md     # EDIT — IndexedDB envelope + TTL + security caveats; remove "current limitations" callout
├── 6.configuration/1.environment.md        # EDIT — document VUESTRATA_DEMO_AUTH_RETENTION_HOURS
├── 3.modules/3.built-in-modules.md         # EDIT — auth module now demo-complete; users module gains invite + permissions
└── 7.testing/*.md                          # EDIT (where relevant) — note demo IndexedDB reset between e2e specs
```

## Technical Direction

**1. Persistence layer (Phase 1).** A shared typed wrapper in `src/modules/app/state/demo-persistence.ts` opens a single database `vuestrata-demo-auth` (version 1) with object stores for `users` (key = `id`) and `session` (key = `'current'`). `src/modules/app/state/demo-storage.ts` wraps every read/write in an envelope `{version: 1, createdAt, expiresAt, integrityHash, payload}` where `integrityHash` is a SHA-256 (via `crypto.subtle.digest`) of the JSON payload + a build-time random salt baked into the envelope. Reads validate version, expiry, and hash; on any failure the record is deleted and `null` is returned (fail-closed per R6). A `BroadcastChannel('vuestrata-demo-auth')` notifies other tabs on writes/clears. TTL is read from `app.config.ts` → `demoAuth.retentionHours` (default 24, env `VUESTRATA_DEMO_AUTH_RETENTION_HOURS`). When IndexedDB is unavailable (private mode/quota), the wrapper returns a no-op in-memory fallback and logs once. Auth and users modules consume this shared storage; they do not own it.

**2. Runtime backend (Phase 2).** `src/modules/app/state/demo-auth-backend.ts` exposes a `createGlobalState` singleton wrapping shared `src/modules/app/state/demo-store.ts`. `installRuntimeBackends()` calls a one-time `seedDemoSuperAdmin()` that inserts `demo@vuestrata.dev` (role `super_admin`, `permissions: [...allRegisteredPermissions()]`) only if the store is empty. The seed reads from `RBAC_REGISTRY` so it stays in sync with whatever permissions are registered.

**3. MSW completion (Phase 3).** `auth.handlers.ts` gains:

- `GET /auth/me` → returns persisted session user.
- `POST /auth/logout` → clears session envelope, broadcasts.
- `POST /auth/refresh` → mints a new JWT from persisted session (preserving `user.permissions`).
- `POST /auth/token` (OAuth code exchange) → looks up persisted user by email or creates one.
- `GET /api/auth/{provider}` + `/api/auth/{provider}/callback` → deterministic redirect/echo for social/OAuth demo paths.
  All handlers source state from shared `src/modules/app/state/demo-store.ts`, never from in-memory arrays. `users.ts` handler gains `POST /users` and `PATCH /users/:id/permissions`, both persisted.

**4. Adapter wiring (Phase 4).** `useAuth.ts` already routes through HTTP; only `exchangeOAuthCode` and the social-login redirect helpers need to point at the new mock routes. The `jwt`/`oauth` adapter stubs continue to delegate — we do not introduce a new "demo" adapter (R11). `restoreSession` in `main.ts` is updated: when the configured adapter is `mock`, attempt to load the persisted session envelope before short-circuiting; if valid, hydrate the auth store and proceed.

**5. Auth store + RBAC (Phase 5).** `useAuthStore.setAuth({user, tokens})` already accepts `user.permissions`. Verify `useRbac` three-tier resolution treats `user.permissions` as authoritative override (it does — `effectivePermissions()` already returns `userPermissions ?? roleDerived`). Add a thin selector `useAuthStore.userPermissions` if not present. No reactive plumbing changes needed beyond ensuring updates from `PATCH /users/:id/permissions` rehydrate the current user when self-edited (via `BroadcastChannel` listener that calls `restoreSession`).

**6. UX (Phase 6).** `users.vue` invite button opens `InviteUserDialog.vue` (email + role select). `UserPermissionsPanel.vue` renders a checkbox matrix from `RBAC_REGISTRY`, pre-checked from `user.permissions ?? rolePermissions(user.role)`, with a "Reset to role defaults" affordance. Mutations use `useMutation` with keys `['users','invite']` and `['users', id, 'permissions']`, invalidating `['users']`.

**7. Config + docs (Phase 7).** `app.config.ts` exposes `demoAuth.retentionHours` parsed from `import.meta.env.VITE_VUESTRATA_DEMO_AUTH_RETENTION_HOURS` (Number, fallback 24, clamped ≥ 1). Update env docs and the three auth-related doc pages to describe the new behavior as **current**, not roadmap.

**8. Tests (Phase 8).** Cover the storage envelope edges (expiry, hash mismatch, version skew, IDB unavailable), the new mock handlers via existing MSW test setup, and a journey test that signs in, edits own permissions, reloads, and confirms guards reflect the change.

## Risks

| Risk                                                                 | Mitigation                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| IndexedDB unavailable in private mode or under quota                 | In-memory fallback in `src/modules/app/state/demo-storage.ts`; one-shot console warning; fail-closed signed-out state. |
| Cross-tab edits cause stale UI                                       | `BroadcastChannel` listener invalidates `['users']` query and reruns `restoreSession` for self-edits.                  |
| Demo admin removes own critical permissions                          | UI confirmation modal + always retain `users:read` and the route guards' minimum set; documented as known limitation.  |
| Hash/integrity check creates false positives across builds           | Envelope `version` field plus salt baked at build time; mismatch clears storage cleanly rather than crashing.          |
| `restoreSession` for `mock` adapter could mask real misconfiguration | Gate behind explicit `configuredAuthAdapter === 'mock'` AND presence of valid envelope; no behavior change otherwise.  |
| New MSW routes drift from real backend contract                      | Keep request/response shapes aligned with existing `useAuth` types; add type assertions in handler tests.              |
| `idb` dependency creep                                               | Default plan uses native IndexedDB; only add `idb` if the native wrapper exceeds ~120 LOC or hits browser quirks.      |
| Tests touching IndexedDB become flaky in jsdom                       | Use `fake-indexeddb` (already a common dev dep) only inside the new unit tests; isolate via `test/setup.ts` reset.     |

## Complexity Tracking

| Violation                                                      | Why Needed                                                              | Simpler Alternative Rejected Because                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Possible new dev dep `fake-indexeddb` for unit tests           | Deterministic IndexedDB tests under jsdom; covers envelope/expiry edges | Mocking the full wrapper would re-implement IndexedDB semantics and miss real serialization/transaction issues. |
| Optional new dep `idb` (only if native wrapper proves brittle) | Browser IndexedDB API is verbose and error-prone for transactions       | Hand-rolled wrapper preferred first; `idb` reserved as fallback to avoid premature dependency.                  |
