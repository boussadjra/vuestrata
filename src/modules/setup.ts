/**
 * Central module registration — app-level modules providing the core feature set.
 *
 * Bootstrap order (enforced by `main.ts`):
 *   1. `app.use(pinia)`            — required before any `useStore()` call
 *   2. `app.use(router)`           — required before `setupModules` adds routes
 *   3. `installI18n(app)`          — required before `loadModuleTranslations`
 *   4. `setupModules(router, appModules, layoutMap)` — registers + enables
 *      modules; calling earlier triggers Pinia "no active instance" errors
 *      from `useModuleStore`/`useAuthStore`.
 *
 * Architecture contract:
 *   - Server state (API data)      → TanStack Query composable in each module's composables/
 *   - Client state (UI/prefs)      → Pinia store in each module's stores/
 *   - Cross-module communication  → appEvents event bus (src/lib/events.ts)
 *   - Public API                  → module's index.ts barrel only (no deep imports)
 *
 * Adding a module:
 *   1. Create src/modules/<name>/index.ts satisfying ModuleDefinition
 *   2. Import and add it to appModules below
 *   3. Run `vp check` to verify the wiring
 */
import analyticsModule from './analytics'
import authModule from './auth'
import billingModule from './billing'
import settingsModule from './settings'
import showcaseModule from './showcase'
import type { ModuleDefinition } from './types'
import usersModule from './users'

export const appModules: ModuleDefinition[] = [
  // auth: login/register/callback pages, useAuth orchestrator, OAuth + MFA
  // mocks. Marked `required: true` — cannot be disabled at runtime.
  authModule,
  // analytics: dashboard overview, audit log, and charts (TanStack Query pattern)
  analyticsModule,
  // billing: subscription, invoices, and payment management (TanStack Query pattern)
  billingModule,
  // users: team member management and role-based access (TanStack Query pattern)
  usersModule,
  // showcase: forms and data-tables demos (presentational only)
  showcaseModule,
  // settings: display preferences and feature flags (Pinia pattern)
  settingsModule,
]
