/**
 * The single entry point to demo state.
 *
 * Everything demo-related — the seeded users, the IndexedDB envelopes, the
 * cross-tab invalidation channel — is reachable only through this barrel, and
 * every import of it must sit behind `if (__VUESTRATA_DEMO__)`. That is what
 * lets rolldown drop the whole subtree from a production bundle.
 *
 * Import the concrete modules directly ONLY from tests, which are not bundled.
 * In application code, importing `~/state/demo-store` statically would defeat
 * the boundary and put the demo super-admin (and every permission it holds)
 * back into the production artifact — which is exactly what
 * `scripts/build/verify-bundle.mjs --strict-demo` checks for.
 */
export { DEMO_ACCOUNT } from './account'

export {
  clearAllDemoData,
  clearDemoSession,
  DEFAULT_DEMO_PERMISSIONS,
  DEFAULT_DEMO_USERS,
  ensureDefaultDemoUsers,
  getDemoSession,
  getDemoUsers,
  setDemoSession,
  setDemoUsers,
  type DemoSession,
} from '../demo-store'

export { broadcastInvalidation, onInvalidation, type DemoInvalidationEvent } from '../demo-storage'

export { seedDemoSuperAdmin } from './seed'
