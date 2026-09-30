import { useModuleStore } from '@/modules'

/**
 * Start the MSW worker with every module's handlers.
 *
 * Only ever called from the `__VUESTRATA_DEMO__` branch of `boot()`, so
 * rolldown removes this function — and with it the `import()` and the
 * msw-vendor chunk — from a production build. Do not call it from anywhere
 * else, and do not import `@/mocks/browser` statically: either would put MSW
 * back into production. `scripts/build/verify-bundle.mjs` is what catches it.
 *
 * Must run AFTER `setupModules()`, so module-contributed handlers (e.g. the
 * auth module's) are collected alongside the static handler set.
 */
export async function startDemoMocks(): Promise<void> {
  const { startMockWorker } = await import('@/mocks/browser')
  const moduleStore = useModuleStore()
  await startMockWorker(await moduleStore.collectMockHandlers())
}
