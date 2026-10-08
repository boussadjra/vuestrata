import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { startDemoMocks } from '@/bootstrap/mocks'
import { startMockWorker } from '@/mocks/browser'
import { isValidToken } from '@/mocks/utils'
import { useModuleStore } from '@/modules'

/**
 * The worker a demo build starts when `VUESTRATA_MOCK_ONLY` lists modules: a
 * real backend answers for everything else, so the worker must hold the listed
 * modules' handlers and no other, and must let every request it has no handler
 * for through without a word.
 *
 * What an ordinary demo starts is pinned in
 * test/integration/mocks/demo-default-behaviour.test.ts.
 */

const env = vi.hoisted(() => ({ overrides: {} as Record<string, unknown> }))
const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }))
const worker = vi.hoisted(() => ({ start: vi.fn(async (_options?: unknown) => undefined) }))
const setupWorker = vi.hoisted(() => vi.fn((..._handlers: unknown[]) => worker))
const staticMocks = vi.hoisted(() => ({
  module: {} as { handlers: unknown[]; handlerSets?: Record<string, unknown[]> },
}))

vi.mock('~/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/config')>()
  return {
    ...actual,
    runtimeEnv: new Proxy(actual.runtimeEnv, {
      get: (target, key) =>
        key in env.overrides ? env.overrides[key as string] : Reflect.get(target, key),
    }),
  }
})
vi.mock('~/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/logger')>()),
  createScopedLogger: () => log,
}))
vi.mock('msw/browser', () => ({ setupWorker }))
vi.mock('@/mocks/browser', () => ({ startMockWorker: vi.fn(async () => {}) }))
vi.mock('@/mocks/utils', () => ({ isValidToken: vi.fn(() => true) }))
vi.mock('@/mocks/handlers', () => ({
  get handlers() {
    return staticMocks.module.handlers
  },
  get handlerSets() {
    return staticMocks.module.handlerSets
  },
}))
vi.mock('@/modules', () => ({ useModuleStore: vi.fn() }))

const handler = (name: string) => ({ name })

const USERS = [handler('users-list')]
const BILLING = [handler('billing-read')]
const ORDERS = [handler('orders-list'), handler('orders-read')]
const AUTH = [handler('auth-login')]

const collectMockHandlers = vi.fn(async () => [...AUTH, ...ORDERS])

function hybrid(mockOnly: string[]) {
  env.overrides = { runtimeMode: 'demo', useMocks: true, authAdapter: 'jwt', mockOnly }
}

beforeEach(() => {
  env.overrides = {}
  for (const fn of [log.warn, log.info, log.error, setupWorker, worker.start]) fn.mockClear()
  vi.mocked(startMockWorker).mockClear()
  vi.mocked(isValidToken).mockReturnValue(true)
  collectMockHandlers.mockClear()

  staticMocks.module = {
    handlers: [...USERS, ...BILLING],
    handlerSets: { users: USERS, billing: BILLING },
  }
  vi.mocked(useModuleStore).mockReturnValue({
    collectMockHandlers,
    allModules: new Map([
      ['auth', { config: { id: 'auth' }, mockHandlers: async () => AUTH }],
      ['orders', { config: { id: 'orders' }, mockHandlers: async () => ORDERS }],
      ['users', { config: { id: 'users' } }],
      ['settings', { config: { id: 'settings' } }],
    ]),
  } as never)
})

describe('startDemoMocks, with VUESTRATA_MOCK_ONLY', () => {
  it('starts a worker with the listed modules’ handlers only', async () => {
    hybrid(['orders'])

    await startDemoMocks()

    expect(setupWorker).toHaveBeenCalledOnce()
    expect(setupWorker.mock.calls[0]).toEqual(ORDERS)
  })

  it('takes a listed module’s static set, and leaves every other static handler out', async () => {
    hybrid(['users', 'orders'])

    await startDemoMocks()

    expect(setupWorker.mock.calls[0]).toEqual([...USERS, ...ORDERS])
    expect(setupWorker.mock.calls[0]).not.toContain(BILLING[0])
  })

  it('never goes through the demo’s startMockWorker(), which adds every static handler', async () => {
    hybrid(['orders'])

    await startDemoMocks()

    expect(startMockWorker).not.toHaveBeenCalled()
    expect(collectMockHandlers).not.toHaveBeenCalled()
  })

  it('lets every request it has no handler for through, silently', async () => {
    hybrid(['orders'])

    await startDemoMocks()

    expect(worker.start.mock.calls).toEqual([
      [
        {
          onUnhandledRequest: 'bypass',
          serviceWorker: { url: '/mockServiceWorker.js' },
          quiet: false,
        },
      ],
    ])
  })

  it('says what is mocked and where the rest goes', async () => {
    hybrid(['users', 'orders'])

    await startDemoMocks()

    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      'Mocking users, orders only (VUESTRATA_MOCK_ONLY). Every other request goes to /api, and ' +
        'a mocked endpoint accepts any token.',
    )
  })

  it('warns about an id that names no module, lists the ones that do, and mocks the rest', async () => {
    hybrid(['orders', 'invoices'])

    await startDemoMocks()

    expect(log.warn.mock.calls).toEqual([
      [
        'VUESTRATA_MOCK_ONLY lists "invoices", which is not a module of this app, so nothing is ' +
          'mocked for it. The ids that can be mocked: billing, orders, users.',
      ],
    ])
    expect(setupWorker.mock.calls[0]).toEqual(ORDERS)
  })

  it('starts no worker at all when the list selects nothing', async () => {
    hybrid(['invoices', 'settings'])

    await startDemoMocks()

    expect(setupWorker).not.toHaveBeenCalled()
    expect(startMockWorker).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenLastCalledWith(
      'VUESTRATA_MOCK_ONLY selected no handlers, so MSW was not started: every request goes to ' +
        'the backend.',
    )
  })

  describe('in a project that kept files from before 1.1.0', () => {
    it('selects no static handler from a handlers file with no handlerSets, and says so', async () => {
      hybrid(['orders', 'users'])
      staticMocks.module = { handlers: [...USERS, ...BILLING] }

      await startDemoMocks()

      // Not the old behaviour, where every static handler would have started.
      expect(setupWorker.mock.calls[0]).toEqual(ORDERS)
      expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/exports no `handlerSets`/))
    })

    it('says when mocks/utils.ts would refuse the backend’s tokens', async () => {
      hybrid(['orders'])
      vi.mocked(isValidToken).mockReturnValue(false)

      await startDemoMocks()

      expect(log.warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /src\/modules\/app\/mocks\/utils\.ts is a copy from before 1\.1\.0.*answer 401/,
        ),
      )
      // Still started: a module's own handlers may not use that check at all.
      expect(setupWorker).toHaveBeenCalledOnce()
    })
  })
})

describe('startDemoMocks, in an ordinary demo', () => {
  it('starts everything through startMockWorker(), and builds no worker of its own', async () => {
    await startDemoMocks()

    expect(startMockWorker).toHaveBeenCalledWith([...AUTH, ...ORDERS])
    expect(setupWorker).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).not.toHaveBeenCalled()
  })

  it('does not take a list for hybrid outside demo mode', async () => {
    // `isHybridRuntime` needs the demo mode. The schema clears the list in
    // production; this is the second lock on the same door.
    env.overrides = { runtimeMode: 'production', mockOnly: ['orders'] }

    await startDemoMocks()

    expect(setupWorker).not.toHaveBeenCalled()
  })
})
