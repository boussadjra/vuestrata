/**
 * Central module registration — app-level modules providing the core feature set.
 *
 * Bootstrap order (enforced by `main.ts`):
 *   1. `app.use(pinia)`            — required before any `useStore()` call
 *   2. `installI18n(app)`          — required before `loadModuleTranslations`
 *   3. `setupModules(router, appModules, layoutMap)` — registers + enables modules
 *   4. `app.use(router)`           — starts the first navigation after module routes exist
 *
 * Architecture contract:
 *   - Server state (API data)      → TanStack Query composable in each module's composables/
 *   - Client state (UI/prefs)      → Pinia store in each module's stores/
 *   - Cross-module communication  → appEvents event bus (src/modules/core/lib/events.ts)
 *   - Public API                  → module's index.ts barrel only (no deep imports)
 *
 * Adding a module:
 *   Run `vpr gen:module <name>` — it writes the module and registers it
 *   here. See docs/9.recipes/1.add-a-module.md for what it does and does not do.
 *
 *   By hand, the same three steps:
 *     1. Create src/modules/<name>/index.ts satisfying ModuleDefinition
 *     2. Import and add it to appModules below
 *     3. Run `vp check` to verify the wiring
 *
 *   Forgetting step 2 produces no error — the module simply never loads. That
 *   is what test/unit/architecture/registry-drift.test.ts exists to catch.
 */
import analyticsModule from './analytics'
import authModule from './auth'
import billingModule from './billing'
import calendarModule from './calendar'
import catalogModule from './catalog'
import customersModule from './customers'
import messagesModule from './messages'
import ordersModule from './orders'
import projectsModule from './projects'
import reportsModule from './reports'
import settingsModule from './settings'
import showcaseModule from './showcase'
import teamModule from './team'
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
  // ─── Domain modules ───────────────────────────────────
  // Each owns a zod contract, a seeded mock backend, queries built on
  // `createCollectionApi`, and functional pages. They are the worked examples
  // for adding a domain of your own.
  customersModule,
  ordersModule,
  catalogModule,
  projectsModule,
  calendarModule,
  messagesModule,
  teamModule,
  reportsModule,
  // users: team member management and role-based access (TanStack Query pattern)
  usersModule,
  // showcase: forms and data-tables demos (presentational only)
  showcaseModule,
  // settings: display preferences and feature flags (Pinia pattern)
  settingsModule,
  // Generated modules append below. The entries above are ordered by role
  // rather than alphabetically, so `vpr gen:module` adds to the end instead
  // of guessing where a new domain belongs — move it up if it has a natural home.
  // vuestrata:modules-start
  // vuestrata:modules-end
  // app:modules-start
  // app:modules-end
]
