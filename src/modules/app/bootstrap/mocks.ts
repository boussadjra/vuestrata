import type { RequestHandler } from 'msw'

import { useModuleStore } from '@/modules'
import { ENV_KEYS, isHybridRuntime, runtimeEnv } from '~/lib/config'
import { createScopedLogger } from '~/lib/logger'

const mockLogger = createScopedLogger('mocks')

/** Where a project gives its static handlers the id of the module they belong to. */
const STATIC_SETS_FILE = 'src/modules/app/mocks/handlers/index.ts'

/**
 * Start the MSW worker: with every module's handlers in the self-contained
 * demo, or with the handlers of the modules `VUESTRATA_MOCK_ONLY` lists when a
 * real backend answers for the rest.
 *
 * Only ever called from the `__VUESTRATA_DEMO__` branch of `boot()`, so
 * rolldown removes this function — and with it the `import()`s and the
 * msw-vendor chunk — from a production build. Do not call it from anywhere
 * else, and do not import `@/mocks/browser` or `msw` statically: either would
 * put MSW back into production. `scripts/build/verify-bundle.mjs` is what
 * catches it.
 *
 * Must run AFTER `setupModules()`, so module-contributed handlers (e.g. the
 * auth module's) are collected alongside the static handler set.
 */
export async function startDemoMocks(): Promise<void> {
  if (isHybridRuntime(runtimeEnv)) {
    await startSelectedMocks(runtimeEnv.mockOnly)
    return
  }

  const { startMockWorker } = await import('@/mocks/browser')
  const moduleStore = useModuleStore()
  await startMockWorker(await moduleStore.collectMockHandlers())
}

/** A module as the selection reads it: its id, and its handler factory if it has one. */
export interface MockableModule {
  config: { id: string }
  mockHandlers?: () => unknown[] | Promise<unknown[]>
}

/** Handlers that no module contributes, by the id of the module they answer for. */
export type StaticHandlerSets = Readonly<Record<string, readonly unknown[]>>

export interface MockSelection {
  /** The handlers to start, in the order the ids were listed: a module's static set, then what it contributed. */
  handlers: unknown[]
  /** The listed ids that selected at least one handler. */
  mocked: string[]
  /** What to tell the developer about the ids that selected none. */
  warnings: string[]
}

/**
 * The handlers of the listed modules, and nothing else.
 *
 * A module's handlers come from two places: the `mockHandlers` factory in its
 * barrel, and a static set registered under its id in `handlerSets`. Both are
 * taken. An id is matched exactly; one that matches nothing is not a reason to
 * stop, because the request it was meant to catch then reaches the backend and
 * fails there in plain sight, but it is said, with the ids that would have
 * worked.
 *
 * Registered modules are read, not only enabled ones: a module somebody turns
 * on later in the session should find its endpoints mocked, since its id is in
 * the list on purpose.
 */
export async function selectMockHandlers(
  mockOnly: readonly string[],
  modules: Iterable<MockableModule>,
  staticSets: StaticHandlerSets | undefined,
): Promise<MockSelection> {
  const byId = new Map<string, MockableModule>()
  for (const mod of modules) byId.set(mod.config.id, mod)

  const sets = staticSets ?? {}
  const mockable = [
    ...new Set([
      ...Object.keys(sets),
      ...[...byId.values()].filter((mod) => mod.mockHandlers).map((mod) => mod.config.id),
    ]),
  ]
    // Never selectable: the environment refuses it beside a real adapter.
    .filter((id) => id !== 'auth')
    .sort()

  const selection: MockSelection = { handlers: [], mocked: [], warnings: [] }

  for (const id of mockOnly) {
    const fromSet = Object.hasOwn(sets, id) ? [...sets[id]!] : []
    const mod = byId.get(id)

    let contributed: unknown[] = []
    let failed = false
    if (mod?.mockHandlers) {
      try {
        contributed = await mod.mockHandlers()
      } catch (err) {
        // As in the demo: one module's broken handlers do not take the rest down.
        mockLogger.error(`Failed to load mock handlers for module "${id}"`, { err })
        failed = true
      }
    }

    if (fromSet.length + contributed.length > 0) {
      selection.handlers.push(...fromSet, ...contributed)
      selection.mocked.push(id)
      continue
    }
    // Already reported, as what it is.
    if (failed) continue

    selection.warnings.push(
      mod
        ? `${ENV_KEYS.mockOnly} lists "${id}", and that module has no mock handlers: its ` +
            `requests go to the backend like any other. A module contributes handlers through ` +
            `\`mockHandlers\` in its barrel, or a set under its id in \`handlerSets\` ` +
            `(${STATIC_SETS_FILE}).`
        : `${ENV_KEYS.mockOnly} lists "${id}", which is not a module of this app, so nothing ` +
            `is mocked for it. The ids that can be mocked: ${mockable.join(', ') || '(none)'}.`,
    )
  }

  if (staticSets === undefined) {
    selection.warnings.push(
      `${STATIC_SETS_FILE} exports no \`handlerSets\`, so its handlers belong to no module and ` +
        `${ENV_KEYS.mockOnly} cannot select them. Export them by module id: ` +
        '`export const handlerSets = { users: usersHandlers, billing: billingHandlers }`.',
    )
  }

  return selection
}

/**
 * Start a worker with the listed modules' handlers only.
 *
 * The worker is started here, not through the project's `startMockWorker()`:
 * that one adds every static handler to whatever it is given, which would mock
 * endpoints nobody listed, and its options are the project's to change. Here
 * they are not. An unhandled request must reach the backend untouched and
 * unremarked (`bypass`), because in this mode nearly every request is one.
 */
async function startSelectedMocks(mockOnly: readonly string[]): Promise<void> {
  // The file is the project's, and one kept from before 1.1.0 has no
  // `handlerSets`: read through the namespace, a missing export is `undefined`
  // rather than a build that fails.
  const staticMocks = (await import('@/mocks/handlers')) as unknown as {
    handlerSets?: StaticHandlerSets
  }
  const selection = await selectMockHandlers(
    mockOnly,
    useModuleStore().allModules.values(),
    staticMocks.handlerSets,
  )

  for (const warning of selection.warnings) mockLogger.warn(warning)

  if (selection.handlers.length === 0) {
    mockLogger.warn(
      `${ENV_KEYS.mockOnly} selected no handlers, so MSW was not started: every request goes ` +
        'to the backend.',
    )
    return
  }

  // `mocks/utils.ts` decides what a mocked endpoint accepts, and a copy a
  // project kept from before 1.1.0 accepts the mock adapter's tokens alone. The
  // backend's would be answered 401 by every mock, with nothing to say why.
  const { isValidToken } = await import('@/mocks/utils')
  if (!isValidToken(new Request(globalThis.location.href))) {
    mockLogger.warn(
      'src/modules/app/mocks/utils.ts is a copy from before 1.1.0: its isValidToken() refuses ' +
        'any token the mock adapter did not issue, so the mocked endpoints will answer 401 to ' +
        'requests signed by your backend. Merge .vuestrata/incoming/src/modules/app/mocks/utils.ts ' +
        'into it and run `vuestrata adopt`.',
    )
  }

  const { setupWorker } = await import('msw/browser')
  await setupWorker(...(selection.handlers as RequestHandler[])).start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      // Resolved against BASE_URL, as the demo's worker is, so it is found
      // when the app is served from a sub-path.
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
    quiet: !import.meta.env.DEV,
  })

  mockLogger.info(
    `Mocking ${selection.mocked.join(', ')} only (${ENV_KEYS.mockOnly}). Every other request ` +
      `goes to ${runtimeEnv.apiUrl}, and a mocked endpoint accepts any token.`,
  )
}
