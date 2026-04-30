# [001] Demo-First Auth Mocking With IndexedDB Persistence

**Branch**: `[001-demo-auth-indexeddb]` | **Date**: 2026-04-26 | **Status**: Draft
**Input**: Product request to make authentication fully demo-ready with persistent client-side data and complete documentation parity.

## Problem

The current auth architecture has good separation between feature-module concerns and platform infrastructure concerns, but demo behavior is incomplete for a production-like walkthrough:

- Not all auth entry points behave as fully local, end-to-end demo flows.
- Demo users and auth-related state are mostly ephemeral, reducing realism after reloads.
- Admin-level demo onboarding is not explicit enough for showcasing user and permission administration.
- Documentation does not yet present one clear, current story for a fully mocked, persistent demo auth mode.

Without a coherent demo-first auth mode, evaluations and onboarding sessions become brittle and inconsistent.

## Goals

- Provide a complete demo auth surface where all sign-in and verification flows are mocked end-to-end.
- Persist demo users and auth-related data in client-side IndexedDB with a default 24-hour retention window.
- Ensure persisted demo auth data is handled with browser-appropriate security controls and clear limitations.
- Seed a default demo user with full permissions who can add users and assign permissions.
- Keep the architecture simple, layered, and aligned with existing module/infrastructure boundaries.
- Update all related markdown docs so runtime behavior and docs stay in sync.

## Non-Goals

- Integrating real third-party identity providers for this feature.
- Introducing a backend service or server database for demo auth state.
- Replacing the existing role model with a new authorization paradigm.
- Building enterprise-grade cryptographic guarantees that browsers cannot provide for local, user-controlled storage.

## User Stories

### US1: Complete Demo Authentication Flows (Priority: P1) 🎯 MVP

As a demo evaluator, I want every auth path (credentials, social login, magic link, OAuth callback, and MFA-related steps) to complete inside the demo runtime, so that I can test all auth journeys without external systems.

**Acceptance Criteria**:

- Every user-facing auth flow has a deterministic mocked path in demo mode.
- Demo mode does not require live identity providers or backend auth endpoints.
- Success and failure states are realistic and visible in the UI.
- Session restoration and refresh behavior are consistent across page reloads.

### US2: Time-Bound Persistent Demo Data (Priority: P1) 🎯 MVP

As a demo host, I want demo users and auth state to survive refreshes for a limited period, so that sessions and data feel realistic during walkthroughs.

**Acceptance Criteria**:

- Demo users and relevant auth records persist across reloads using IndexedDB.
- Persisted records expire automatically after a default 24-hour retention period.
- The retention period is configurable through environment variables.
- The system can recover safely from missing, expired, or corrupted persisted data.
- A clear reset path exists to wipe demo auth data intentionally.

### US3: Secure-By-Default Browser Handling (Priority: P1) 🎯 MVP

As a security-conscious maintainer, I want demo persistence to use practical browser security safeguards, so that sensitive data exposure risk is minimized for local demo usage.

**Acceptance Criteria**:

- Sensitive auth material is not stored as raw plaintext where avoidable.
- Integrity and expiry validation are applied before persisted auth data is reused.
- Security behavior and limitations of browser-local storage are explicitly documented.
- Demo mode fails closed (signed-out state) when validation fails.

### US4: Privileged Demo Admin for User/Permission Management (Priority: P1) 🎯 MVP

As a demo administrator, I want a default user with full permissions and user-management capabilities, so that I can create users and assign permissions during demos.

**Acceptance Criteria**:

- A seeded default demo admin account has full effective permissions.
- The demo admin can add users from the users management surface.
- The demo admin can assign both roles and explicit per-user permissions, and see those changes reflected immediately.
- Guarded routes and UI capability checks honor updated permissions without requiring app restart.

### US5: Keep Architecture Simple and Maintainable (Priority: P2)

As a maintainer, I want the solution to avoid unnecessary abstraction, so that demo auth remains easy to reason about and extend.

**Acceptance Criteria**:

- Module responsibilities remain clear between auth feature concerns and core infrastructure concerns.
- No duplicate auth orchestration logic is introduced across adapters.
- State ownership remains single-sourced and testable.
- New complexity is justified by at least one concrete user-facing need.

### US6: Documentation Parity for Auth Module and Infrastructure (Priority: P2)

As a developer using the project docs, I want markdown documentation to match the new demo auth behavior, so that configuration and architecture guidance are accurate.

**Acceptance Criteria**:

- Auth architecture docs describe the demo-first mocked flow coverage.
- Configuration docs describe demo auth mode, retention behavior, and security caveats.
- Module docs reflect ownership boundaries and admin capability expectations.
- Testing docs include the updated auth demo assumptions where relevant.

## Functional Requirements

| ID  | Requirement                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The system MUST provide end-to-end mocked behavior for credentials, social login, magic link request/verify, OAuth callback exchange, logout, and MFA demo paths. |
| R2  | Demo mode MUST run without external auth providers or live auth backend dependencies.                                                                             |
| R3  | The system MUST persist demo user directory and auth session artifacts in IndexedDB.                                                                              |
| R4  | Persisted demo data MUST include expiration metadata and be automatically invalidated when stale. The default retention window is 24 hours.                       |
| R4a | The demo retention window MUST be configurable through environment variables.                                                                                     |
| R5  | The system MUST validate persisted auth records before restoring an authenticated session.                                                                        |
| R6  | When persisted auth records fail validation, the system MUST clear invalid data and transition to signed-out state.                                               |
| R7  | A default demo admin account MUST be seeded with full effective permissions.                                                                                      |
| R8  | The demo admin MUST be able to add users, assign roles, and assign explicit per-user permissions through existing user-management capabilities.                   |
| R9  | Effective authorization MUST support explicit per-user permissions in addition to role-derived permissions.                                                       |
| R9a | Updates to roles and explicit per-user permissions MUST be reflected immediately in authorization checks and guarded navigation behavior.                         |
| R10 | The architecture MUST preserve explicit separation between auth feature orchestration and infrastructure runtime services.                                        |
| R11 | The solution MUST avoid introducing unnecessary indirection or duplicate adapter logic.                                                                           |
| R12 | Related markdown documentation MUST be updated in the same change to reflect the new auth module and infrastructure behavior.                                     |

## Non-Functional Requirements

- Keep the design intentionally simple and maintainable; prefer straightforward data flow over layered indirection.
- Follow existing TypeScript strictness and repository conventions.
- Maintain deterministic behavior for local development and automated testing.
- Preserve current UX expectations for auth and route-guard behavior unless explicitly changed by this feature.
- Clearly document browser-local security limitations for demo persistence.

## Edge Cases

- IndexedDB unavailable (private mode, quota, or browser restrictions).
- Persisted auth/session data expires while the app remains open.
- Corrupted persisted records or schema-version mismatches.
- Cross-tab edits to users/permissions causing stale UI state.
- Role-derived permissions and explicit per-user permissions produce overlapping effective access.
- Demo admin accidentally removes own critical permissions.
- OAuth state exists but corresponding persisted session artifacts are missing or expired.

## Resolved Clarifications

- Demo data retention defaults to 24 hours and is configurable via environment variables.
- Permission assignment includes explicit per-user permissions in addition to role assignment.
