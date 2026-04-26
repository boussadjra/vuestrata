import { setActivePinia, createPinia } from 'pinia'

import { installRuntimeBackends, resetRuntimeBackends } from '~/state/runtime-backends'

/**
 * Central reset helper for runtime state owned by `core/lib` injection
 * slots and app-layer state containers.
 *
 * Call from test setup hooks to guarantee that:
 *   - A fresh Pinia is active (so `useApiRuntimeStore` and other Pinia
 *     stores start from clean state).
 *   - All `core/lib` runtime backends are re-installed.
 *   - Cross-suite createGlobalState containers (RBAC, validation cache)
 *     are reset to their seeded state.
 *
 * Test files that touch runtime singletons (auth, RBAC, validation,
 * mocks worker, theme/icon registries, shape composable) should rely
 * on this from `test/setup.ts` rather than reaching into per-file
 * `clearXxx()` helpers.
 */
export function resetRuntimeState(): void {
  setActivePinia(createPinia())
  installRuntimeBackends()
  resetRuntimeBackends()
}
