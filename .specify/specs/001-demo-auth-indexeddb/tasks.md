# Tasks: Demo-First Auth Mocking With IndexedDB Persistence

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md)
**Prerequisites**: `plan.md` complete, `spec.md` finalized ✅

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Safe to run in parallel with other tasks that share no file dependency
- **[Story]**: Linked user story from spec (US1–US6)

---

## Phase 1: Shared Persistence Infrastructure

**Purpose**: Build the app-level IndexedDB wrapper and envelope layer that every feature module will consume. Nothing else can be wired until this exists. Covers US2 (persistence) and US3 (secure handling).

- [x] T001 [US2] [US3] Create `src/modules/app/state/demo-persistence.ts` — typed IndexedDB helper. Opens a single DB named `vuestrata-demo-auth` version 1 with two object stores: `users` (keyPath `id`) and `session` (keyPath `key`). Export `openDemoDB(): Promise<IDBDatabase>` with an in-memory fallback (log once, return a no-op implementation) when `window.indexedDB` is unavailable. Export `getRecord<T>(store, key)`, `putRecord<T>(store, key, value)`, `deleteRecord(store, key)`, `clearStore(store)` — all returning Promises. No framework imports; pure TypeScript.

- [x] T002 [US2] [US3] Create `src/modules/app/state/demo-storage.ts` — shared envelope layer. Define `DemoEnvelope<T> = { version: 1; createdAt: number; expiresAt: number; integrityHash: string; payload: T }`. Export `writeEnvelope<T>(store, key, payload, ttlHours): Promise<void>` — serialises payload to JSON, computes `integrityHash` via `crypto.subtle.digest('SHA-256', payload_json + DEMO_SALT)` where `DEMO_SALT` is a `const` string derived from `import.meta.env.VITE_VUESTRATA_DEMO_SALT ?? 'vuestrata-demo-v1'`, writes envelope via `demo-persistence.ts`. Export `readEnvelope<T>(store, key): Promise<T | null>` — reads record, validates `version === 1`, `expiresAt > Date.now()`, and `integrityHash` match; on any failure calls `deleteRecord(store, key)` and returns `null` (fail-closed). Export `broadcastInvalidation(event: 'clear' | 'update')` and `onInvalidation(cb)` backed by a `BroadcastChannel('vuestrata-demo-auth')` — call `broadcastInvalidation` from every write and clear. TTL hours sourced from `appConfig.demoAuth.retentionHours` (added in T004).

- [x] T003 [US2] Create `src/modules/app/state/demo-store.ts` — typed store accessors. Import `readEnvelope`, `writeEnvelope`, `clearStore` from `demo-storage.ts`. Export:
  - `getDemoUsers(): Promise<User[]>` — reads `users` store key `'list'`.
  - `setDemoUsers(users: User[]): Promise<void>` — writes with TTL from config.
  - `getDemoSession(): Promise<DemoSession | null>` — reads `session` store key `'current'`. (`DemoSession = { user: User; token: string; refreshToken: string; expiresIn: number }`)
  - `setDemoSession(session: DemoSession): Promise<void>` — writes with TTL from config.
  - `clearDemoSession(): Promise<void>` — deletes `session`/`'current'`; broadcasts `'clear'`.
  - `clearAllDemoData(): Promise<void>` — clears both stores; broadcasts `'clear'`.
    Import `User` from `~/types`. No Vue/Pinia imports — this is a pure async module.

- [x] T004 [US2] Extend `src/modules/app/config/app.config.ts` — add `demoAuth` config section. Parse `import.meta.env.VITE_VUESTRATA_DEMO_AUTH_RETENTION_HOURS` as `Number`, clamp to `Math.max(1, value)`, default to `24` when unset or `NaN`. Export it as part of the config object: `demoAuth: { retentionHours: number }`. Follow the existing `pickEnum` / validation pattern in the file.

**Checkpoint**: `demo-persistence.ts`, `demo-storage.ts`, `demo-store.ts` compile clean. `vp check` passes on touched files.

---

## Phase 2: Runtime Backend + Demo Super-Admin Seed

**Purpose**: Wire the shared storage into the bootstrap layer and seed the privileged demo user on first run. Covers US4 (privileged admin).

- [x] T005 [US4] Create `src/modules/app/state/demo-auth-backend.ts` — `createGlobalState` singleton. Call `createGlobalState(() => ({ store: demoStore }))` where `demoStore` re-exports `getDemoUsers`, `setDemoUsers`, `getDemoSession`, `setDemoSession`, `clearDemoSession`, `clearAllDemoData` from `demo-store.ts`. Export `useDemoAuthBackend()`. This singleton is the single import point for all feature-module MSW handlers so they never import `demo-store.ts` directly (one seam for future testing).

- [x] T006 [US4] Extend `src/modules/app/state/runtime-backends.ts` — register demo backend and seed. Add `seedDemoSuperAdmin(): Promise<void>`: loads current users from `getDemoUsers()`; if the list is empty, builds the seed user `{ id: '1', email: 'demo@vuestrata.dev', name: 'Demo Admin', role: 'super_admin', permissions: [...rbacBackendState().permissions], emailVerified: true, mfaEnabled: false, provider: 'credentials', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() }` and persists it. Call `await seedDemoSuperAdmin()` inside `installRuntimeBackends()` after `installRbacBackend(...)` so the RBAC registry is already seeded before the user fixture is created.

- [x] T007 [US4] Edit `src/modules/app/mocks/fixtures/users.ts` — promote demo user. Change the `demo@vuestrata.dev` entry: set `role: 'super_admin'` and add `permissions: ['users:read','users:create','users:update','users:delete','roles:read','roles:assign','billing:read','billing:manage','dashboard:read','dashboard:export','settings:read','settings:update','reports:read','reports:create','reports:export','audit:read']` (mirrors `BUILTIN_PERMISSIONS` from `runtime-backends.ts`). Keep all other users unchanged.

**Checkpoint**: `installRuntimeBackends()` resolves without error; `useDemoAuthBackend()` returns a non-null object; demo user fixture has `role: 'super_admin'`. `vp check` clean.

---

## Phase 3: MSW Handler Completion (US1)

**Purpose**: All auth and user flows work end-to-end in demo mode — no external network needed. Every handler reads/writes through the shared `useDemoAuthBackend()` singleton rather than the in-memory `mockUsers` array.

- [x] T008 [US1] Extend `src/modules/auth/mocks/auth.handlers.ts` — migrate existing handlers to demo-store and add missing auth endpoints. For each existing handler (`POST /auth/login`, `POST /auth/register`, `POST /auth/magic-link`, `POST /auth/magic-link/verify`, `POST /auth/mfa/verify`) replace `mockUsers` reads/writes with `useDemoAuthBackend()` calls (`getDemoUsers` / `setDemoUsers`); persist the session via `setDemoSession` after a successful auth. Add:
  - `GET /auth/me` → call `getDemoSession()`; if null return 401; return `session.user`.
  - `POST /auth/logout` → call `clearDemoSession()`; return 204.
  - `POST /auth/refresh` → call `getDemoSession()`; if null return 401; mint new JWT via `createMockJwt` (preserving `user.permissions`); persist updated session; return new `{ token, refreshToken, expiresIn }`.
  - `POST /auth/token` (OAuth code exchange) → accept `{ code, provider }`; look up persisted user by email embedded in `code` param OR create a new member-role user; persist session; return `{ user, token, refreshToken, expiresIn }`.

- [x] T009 [US1] [P] Extend `src/modules/auth/mocks/auth.handlers.ts` — add social/OAuth provider routes. Add:
  - `GET /api/auth/:provider` → return `HttpResponse.redirect` to `/auth/callback?code=demo-oauth-code-${provider}&state=mock`)` (deterministic code for the demo flow).
  - `GET /api/auth/:provider/callback` → same redirect so direct navigation also works.
    Handlers run after T008 is merged; can be written in a separate commit on the same file if needed.

- [x] T010 [US1] [US4] Extend `src/modules/app/mocks/handlers/users.ts` — add missing user-management endpoints. Migrate the existing `GET /users` and `PATCH /users/:id/role` to read/write through `useDemoAuthBackend()` (`getDemoUsers` / `setDemoUsers`). Add:
  - `POST /users` → accept `{ email, name, role }`, validate required fields, check for duplicate email, create new `User` with generated UUID (use `crypto.randomUUID()`), persist updated list, return new user with 201.
  - `PATCH /users/:id/permissions` → accept `{ permissions: Permission[] }`, locate user in persisted list, merge explicit permissions, persist, return updated user. Also persist an updated `DemoSession` if `params.id` matches the current session user (self-edit case, so RBAC checks refresh on next request).

- [x] T011 [US1] [US4] Edit `src/modules/app/mocks/utils.ts` — carry `permissions` in JWT claims. Extend `createMockJwt` to accept optional `permissions?: string[]` in its payload parameter. Include them in the JWT body as `permissions: payload.permissions ?? []`. No other callers change; the field is optional.

**Checkpoint**: All listed mock routes return the expected shapes. `vp check` clean. Auth flow tests (if run) produce no new failures.

---

## Phase 4: Adapter Wiring + Session Restore (US1, US2)

**Purpose**: Connect the demo-storage layer to the bootstrap and OAuth flow so the app re-hydrates state on reload and social login completes end-to-end.

- [x] T012 [US1] Edit `src/modules/auth/composables/useAuth.ts` — align OAuth helpers with new mock routes. In `exchangeOAuthCode`, confirm the `POST /auth/token` endpoint is used (it should already be; verify the URL matches the handler added in T008). In the social-login redirect helper, confirm the redirect URL points to `/api/auth/:provider` (matching T009). If any URLs are hardcoded differently, update them. Do not change the function signatures or orchestrator structure.

- [x] T013 [US2] [US3] Edit `src/main.ts` — enable session restore for mock adapter. In `restoreSession`, replace the early-return line `if (configuredAuthAdapter === 'mock' || !authStore.token) return` with: if `configuredAuthAdapter === 'mock'`, call `getDemoSession()` from `demo-store.ts`; if the envelope is valid hydrate the auth store via `authStore.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)` and return; otherwise return (no network call). The non-mock path is unchanged. Register a `BroadcastChannel` `'update'`-event listener in `main.ts` after bootstrap that calls `restoreSession(authStore)` when the message is a `'self-permissions-update'` (from T010 PATCH self-edit handling), so guards refresh without a page reload.

- [x] T014 [US1] Verify `src/modules/auth/pages/callback.vue` — confirm the OAuth callback page reads the `code` and `state` query params and calls `exchangeOAuthCode`; confirm it handles the deterministic `demo-oauth-code-*` codes produced by T009. No code change expected — document result.

**Checkpoint**: Reload after login restores authenticated state from IndexedDB (visible in devtools Application → IndexedDB). Social login flow navigates through callback and lands on dashboard. `vp check` clean.

---

## Phase 5: Auth Store & RBAC Wiring (US3, US4)

**Purpose**: Ensure `user.permissions` flows correctly from demo-store through the auth store to all RBAC checks and route guards.

- [x] T015 [US3] [US4] Edit `src/modules/app/stores/auth.ts` — verify and harden `user.permissions` flow. Confirm `userPermissions` computed already returns `user.value?.permissions ?? []` (it does per current code). Confirm `setAuth` accepts `user: User` and the `User` type already has `permissions?: Permission[]`. If `setUser` is also used (in non-mock restore path), ensure it copies `user.permissions`. No behavioural changes needed — add an explicit TypeScript assertion comment if the field is conditional so future editors don't drop it.

- [ ] T016 [US4] Verify `src/modules/app/composables/useRbac.ts` — confirm three-tier resolution. Read `effectivePermissions()` and confirm it evaluates `user.permissions` from the auth store as a top-priority override before role-derived permissions. If the override path is present (it is — `userPermissions ?? roleDerived`), no change needed; document the verification. If missing, add: `if (userPermissions.value.length > 0) return userPermissions.value`.

**Checkpoint**: `useRbac` returns explicit permissions for the demo super-admin without relying on role inheritance alone. `vp check` clean.

---

## Phase 6: Users UX — Invite & Per-User Permissions (US4)

**Purpose**: Surface user-management capabilities added in Phase 3 to the demo admin through the users page UI.

- [ ] T017 [US4] Create `src/modules/users/composables/useInviteUserMutation.ts` — `POST /users` mutation. Use `useMutation` from `@tanstack/vue-query` with mutation key `['users', 'invite']`. On success, invalidate `['users']` query. Accept `{ email: string; name: string; role: Role }` as variables. Use `ofetch` (via the existing api client) for the request. Return the composed `useMutation` result.

- [ ] T018 [US4] [P] Create `src/modules/users/composables/useUpdatePermissionsMutation.ts` — `PATCH /users/:id/permissions` mutation. Use `useMutation` with key `['users', id, 'permissions']`. On success, invalidate `['users']`. Accept `{ id: string; permissions: Permission[] }` as variables. Return composed result.

- [ ] T019 [US4] Create `src/modules/users/components/InviteUserDialog.vue` — invite form. Use `Ui*` wrappers only (no provider-internal imports). Fields: `email` (type email, required), `name` (text, required), `role` (select from Role values, default `'member'`). Submit calls `useInviteUserMutation`. Show inline validation errors via Formwerk or the existing validation composables. Emit `'close'` on success or cancel. Mobile-first layout (stacked fields, full-width submit).

- [ ] T020 [US4] [P] Create `src/modules/users/components/UserPermissionsPanel.vue` — permissions checkbox matrix. Accept prop `user: User`. Import `useDemoAuthBackend` to read current effective permissions. Render one checkbox per permission from `BUILTIN_PERMISSIONS` (import from `runtime-backends.ts` or RBAC registry). Pre-check permissions from `user.permissions ?? roleDefaultPermissions(user.role)` (use existing RBAC `inheritedPermissions` helper). Include a "Reset to role defaults" button that clears `user.permissions` back to `undefined`. Submit calls `useUpdatePermissionsMutation`. Show a guard: if `user.id === currentUser.id`, display a warning banner before allowing removal of own permissions. Never allow removing `users:read` from self (disable that checkbox for self-edits).

- [ ] T021 [US4] Edit `src/modules/users/pages/users.vue` — wire invite button and permissions panel. (1) Add `@click` on the existing invite/add-user button to toggle a ref `showInviteDialog`; mount `<InviteUserDialog v-if="showInviteDialog" @close="showInviteDialog = false" />`. (2) In the per-user row actions (or in an expandable row / slide-over panel), add a "Permissions" action that sets a `selectedUser` ref; mount `<UserPermissionsPanel v-if="selectedUser" :user="selectedUser" @close="selectedUser = null" />`. Use `Ui*` wrappers for the action trigger. Ensure the panel is accessible (focus-trapped dialog or accessible disclosure).

**Checkpoint**: Demo admin can invite a new user and assign explicit permissions from the users page. Both actions are reflected immediately in the user list (TanStack Query invalidation). `vp check` clean.

---

## Phase 7: Config & Documentation (US6)

**Purpose**: Keep docs and env examples in sync with the new behaviour (Constitution principle VI and XVII).

- [ ] T022 [US6] [P] Edit `docs/6.configuration/1.environment.md` — add `VITE_VUESTRATA_DEMO_AUTH_RETENTION_HOURS` entry. Document: type `number`, default `24`, minimum `1`, effect "hours before demo IndexedDB data expires and the session is cleared". Place in the relevant env-var table near auth-related entries.

- [ ] T023 [US6] [P] Edit `docs/6.configuration/2.auth-rbac.md` — update to current behaviour. Remove the "Demo Auth Roadmap" callout added earlier. Add a section "Demo Mode" describing: all auth flows are fully mocked end-to-end; credentials, social, magic link, OAuth callback, and MFA paths all function without external providers; session and user data persist in IndexedDB with a configurable TTL; the default demo admin has `super_admin` role and full explicit permissions.

- [ ] T024 [US6] [P] Edit `docs/6.configuration/3.auth-deep-dive.md` — remove limitations callout; add IndexedDB section. Replace the "Current demo-mode limitations (before Spec 001)" subsection with "Demo-Mode Persistence" covering: IndexedDB envelope structure, SHA-256 integrity check, TTL and env-var override, in-memory fallback for private mode, BroadcastChannel cross-tab invalidation, security caveats (user-controlled storage, no server-side guarantee, clear-data DevTools attack surface).

- [ ] T025 [US6] [P] Edit `docs/3.modules/3.built-in-modules.md` — update auth and users module descriptions. Auth: remove roadmap note; state demo auth is complete. Users: add paragraph describing invite capability and per-user permissions assignment.

- [ ] T026 [US6] [P] Edit `docs/7.testing/` (relevant file) — add note on demo IndexedDB teardown. State that `test/setup.ts` `beforeEach` calls `resetRuntimeState()` which must also clear the demo IndexedDB stores (handled by `clearAllDemoData()` called from the reset helper). Document that E2E specs run against MSW with a fresh in-memory fallback (IndexedDB is not available in Playwright's Node context).

**Checkpoint**: `docs/` changes render correctly in markdown preview. No broken links. `vp check` clean.

---

## Phase 8: Tests (US2, US3, US4, US5)

**Purpose**: Cover every layer with purposeful, non-redundant tests as required by Constitution principle XV.

- [ ] T027 [US2] [US3] Create `test/unit/app/demo-storage.test.ts` — storage envelope tests. Import test utilities from `vite-plus/test`. Use `fake-indexeddb` (add as devDependency via `vp add -D fake-indexeddb`) to provide an in-memory IndexedDB in jsdom. Test cases:
  1. `writeEnvelope` + `readEnvelope` round-trips a typed payload.
  2. `readEnvelope` returns `null` and deletes the record when `expiresAt` is in the past.
  3. `readEnvelope` returns `null` and deletes the record when `integrityHash` is tampered.
  4. `readEnvelope` returns `null` when `version` is mismatched.
  5. `readEnvelope` returns `null` gracefully when the record is missing.
  6. When `window.indexedDB` is unavailable, `writeEnvelope` resolves without throwing and `readEnvelope` returns `null`.
  7. `broadcastInvalidation` sends a message on the `BroadcastChannel`; `onInvalidation` receives it.

- [ ] T028 [US2] [P] Create `test/unit/app/demo-store.test.ts` — demo-store CRUD tests. Use `fake-indexeddb`. Test cases:
  1. `getDemoUsers` returns `[]` on empty store.
  2. `setDemoUsers` + `getDemoUsers` round-trips a user array.
  3. `getDemoSession` returns `null` on empty store.
  4. `setDemoSession` + `getDemoSession` round-trips a session object.
  5. `clearDemoSession` removes the session and broadcasts `'clear'`.
  6. `clearAllDemoData` empties both stores and broadcasts `'clear'`.

- [ ] T029 [US4] Edit `test/stores.test.ts` — add `userPermissions` selector assertion. Add a test that calls `authStore.setAuth(userWithPermissions, token, refreshToken)` and asserts `authStore.userPermissions` returns the user's explicit permissions array. Existing tests must continue to pass.

- [ ] T030 [US1] [US4] Create `test/component/users/users-page.test.ts` — users page invite and permissions flows. Use `@testing-library/vue` with MSW handlers active. Test cases:
  1. Invite dialog opens when the invite button is clicked.
  2. Submitting the invite form with valid data calls `POST /users` and the new user appears in the list.
  3. Submitting with a duplicate email shows an inline error.
  4. Permissions panel opens for a user row.
  5. Toggling a permission checkbox and saving calls `PATCH /users/:id/permissions` and the updated user is reflected.
  6. Self-edit: the `users:read` checkbox is disabled.

- [ ] T031 [US1] [US2] Create `test/integration/auth/session-restore.test.ts` — session lifecycle. Use `fake-indexeddb` and the existing MSW setup. Test cases:
  1. After a successful `POST /auth/login`, a `DemoSession` is written to IndexedDB.
  2. Calling `restoreSession(authStore)` with a valid persisted envelope hydrates the auth store (user, token, refreshToken).
  3. Calling `restoreSession` with an expired envelope results in `authStore.isAuthenticated === false` and the record is removed.
  4. Calling `restoreSession` with a corrupted envelope (hash tampered) results in `isAuthenticated === false`.

**Checkpoint**: `vp test --run test/unit/app test/component/users test/integration/auth test/stores.test.ts` passes with no failures.

---

## Phase 9: Quality Gates

- [ ] T032 Run `vp check` — zero TypeScript errors, zero lint errors across all touched files.
- [ ] T033 [P] Run `vp test --run test/unit/app test/component/users test/integration/auth test/stores.test.ts` — all tests green.
- [ ] T034 [P] Run `vp build` — production bundle builds without errors (validates no dev-only imports leak into runtime).

---

## Dependencies & Execution Order

```
T001–T004 (Phase 1, T002–T004 parallel after T001)
  → T005–T007 (Phase 2, T005–T007 parallel)
  → T008–T011 (Phase 3; T009 parallel with T008 same file, T010–T011 parallel with T009)
  → T012–T014 (Phase 4; T013–T014 parallel after T012)
  → T015–T016 (Phase 5, parallel)
  → T017–T021 (Phase 6; T018 parallel with T017, T019 after T017, T020 parallel with T019, T021 after T019+T020)
  → T022–T026 (Phase 7, all parallel)
  → T027–T031 (Phase 8; T028–T029 parallel with T027, T030 after T010+T019+T021, T031 after T008+T013)
  → T032–T034 (Phase 9, T033–T034 parallel after T032)
```

> **Parallel slots per phase**:
> Phase 1: T002, T003, T004 can start after T001 opens the DB schema.
> Phase 3: T010 and T011 are independent of T008/T009.
> Phase 6: T017 and T018 are independent; T019 and T020 are independent of each other.
> Phase 7: All docs tasks are independent.
> Phase 8: T027 and T028 share `fake-indexeddb` setup but touch different files.
