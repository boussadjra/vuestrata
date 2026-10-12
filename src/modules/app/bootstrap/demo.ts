import type { Router } from 'vue-router'

import { resetAuthInterceptor } from '@/lib/api/client'

/**
 * Everything in here is demo-only, and only `boot()` may call it — always from
 * inside an `if (__VUESTRATA_DEMO__ ...)` branch.
 *
 * That is what lets rolldown drop the `import('@/state/demo')` below, with the
 * IndexedDB demo layer, the seeded super-admin and the demo credentials behind
 * it, from a production build. Importing `~/state/demo-store` statically
 * anywhere in application code would defeat this;
 * `scripts/build/verify-bundle.mjs --strict-demo` is what catches it.
 */

/** Load the demo-state barrel. */
export function loadDemoState() {
  return import('@/state/demo')
}

export type DemoState = Awaited<ReturnType<typeof loadDemoState>>

/** The slice of the auth store the demo tab sync touches. */
export interface DemoAuthStore {
  readonly isAuthenticated: boolean
  clearAuth: () => void
}

/**
 * Drop the session in this tab because another tab signed out, and leave the
 * protected page the visitor was on.
 *
 * The login URL carries `redirect` and, on purpose, no `reason`. The expiry
 * redirect (`expiredSessionTarget` in auth-wiring.ts) adds `reason=expired`,
 * and the login page then says the session expired. Here that would be untrue:
 * the person signed out themselves, in the other tab, and a notice telling
 * them a timer did it is the mistake the expiry path was fixed to stop making.
 * The poll below ends up here too when the stored demo session is gone, which
 * is the same sign-out seen late, or storage the visitor cleared.
 */
export async function clearDemoAuthTab(
  authStore: Pick<DemoAuthStore, 'clearAuth'>,
  router: Pick<Router, 'currentRoute' | 'replace'>,
): Promise<void> {
  const currentRoute = router.currentRoute.value
  const shouldRedirect =
    currentRoute.meta.requiresAuth === true || currentRoute.path.startsWith('/dashboard')

  authStore.clearAuth()
  resetAuthInterceptor()
  if (shouldRedirect) {
    await router.replace({
      path: '/auth/login',
      query: { redirect: currentRoute.fullPath },
    })
  }
}

/**
 * Cross-tab demo session syncing. It exists so signing out in one tab clears
 * the others, which real backends handle with a shared cookie or a 401 on the
 * next request.
 *
 * @param restore Re-read the session after another tab updated it.
 */
export async function installDemoTabSync(options: {
  authStore: DemoAuthStore
  router: Pick<Router, 'currentRoute' | 'replace'>
  load: () => Promise<DemoState>
  restore: () => Promise<void>
}): Promise<void> {
  const { authStore, router, load, restore } = options
  const { getDemoSession, onInvalidation } = await load()

  onInvalidation(async (event) => {
    if (event === 'update') {
      await restore()
      return
    }

    if (event === 'clear') {
      await clearDemoAuthTab(authStore, router)
    }
  })

  const demoSessionPoll = window.setInterval(async () => {
    if (!authStore.isAuthenticated) return

    const session = await getDemoSession()
    if (!session) await clearDemoAuthTab(authStore, router)
  }, 1000)

  window.addEventListener('beforeunload', () => window.clearInterval(demoSessionPoll), {
    once: true,
  })
}
