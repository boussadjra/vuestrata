import type { RequestHandler } from 'msw'
import type { SetupWorker } from 'msw/browser'

import { useMockWorker } from '@/state/mock-worker'

import { handlers as staticHandlers } from './handlers'

/**
 * Start the MSW service worker with the static (non-module) handlers plus any
 * extra handlers contributed by enabled modules. Idempotent — calling twice
 * returns the existing worker without re-starting it.
 *
 * Module handlers must be passed in by the caller because the module store
 * is not available at module-evaluation time (it is created during pinia
 * setup and populated by `setupModules`). Bootstrapping order: pinia →
 * setupModules → startMockWorker(useModuleStore().collectMockHandlers()).
 */
export async function startMockWorker(extraHandlers: unknown[] = []): Promise<SetupWorker> {
  return useMockWorker().start([...staticHandlers, ...(extraHandlers as RequestHandler[])])
}

/** Currently-running worker instance, or `null` if `startMockWorker` was never called. */
export function getMockWorker(): SetupWorker | null {
  return useMockWorker().get()
}
