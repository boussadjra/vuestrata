import { useModuleStore } from '@/modules'
import { isHybridRuntime, runtimeEnv } from '~/lib/config'

/**
 * Start the MSW worker: with every module's handlers in the self-contained
 * demo, or with the handlers of the modules `VUESTRATA_MOCK_ONLY` lists when a
 * real backend answers for the rest (`./mock-selection`).
 *
 * Only ever called from the `__VUESTRATA_DEMO__` branch of `boot()`, so
 * rolldown removes this function — and with it the `import()`s and the
 * msw-vendor chunk — from a production build. Do not call it from anywhere
 * else, and do not import `@/mocks/browser` statically: either would put MSW
 * back into production. `scripts/build/verify-bundle.mjs` is what catches it.
 *
 * Must run AFTER `setupModules()`, so module-contributed handlers (e.g. the
 * auth module's) are collected alongside the static handler set.
 */
export async function startDemoMocks(): Promise<void> {
  if (isHybridRuntime(runtimeEnv)) {
    const { startSelectedMocks } = await import('./mock-selection')
    await startSelectedMocks(runtimeEnv.mockOnly)
    return
  }

  const { startMockWorker } = await import('@/mocks/browser')
  const moduleStore = useModuleStore()
  await startMockWorker(await moduleStore.collectMockHandlers())
}
