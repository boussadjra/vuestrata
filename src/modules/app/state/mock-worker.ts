import type { RequestHandler } from 'msw'
import { setupWorker, type SetupWorker } from 'msw/browser'

/**
 * Shared MSW worker singleton, wrapped in `createGlobalState` so the worker
 * reference is not held in module-scope mutable state.
 *
 * The factory exposes `start()` (idempotent), `get()`, and `reset()`; it
 * accepts handlers at start time because module-contributed handlers are
 * collected after Pinia/module bootstrap.
 */
export const useMockWorker = createGlobalState(() => {
  const cell: { worker: SetupWorker | null } = { worker: null }

  async function start(handlers: RequestHandler[]): Promise<SetupWorker> {
    if (cell.worker) return cell.worker
    cell.worker = setupWorker(...handlers)
    await cell.worker.start({ onUnhandledRequest: 'bypass' })
    return cell.worker
  }

  function get(): SetupWorker | null {
    return cell.worker
  }

  function reset(): void {
    cell.worker?.stop()
    cell.worker = null
  }

  return { start, get, reset }
})
