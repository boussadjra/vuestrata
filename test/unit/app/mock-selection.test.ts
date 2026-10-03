import { describe, expect, it, vi } from 'vite-plus/test'

import { selectMockHandlers, type MockableModule } from '@/bootstrap/mock-selection'
import { handlers as staticHandlers, handlerSets } from '@/mocks/handlers'
import { appModules } from '@/modules/setup'

/**
 * Which handlers `VUESTRATA_MOCK_ONLY` starts.
 *
 * The list holds module ids. A module's handlers come from its barrel's
 * `mockHandlers` factory and from the static set registered under its id, and
 * the selection must hold those, all of them, and nothing a listed id did not
 * name: an endpoint mocked by accident beside a real backend looks exactly like
 * the backend answering.
 */

const handler = (name: string) => ({ name })

function mod(id: string, handlers?: unknown[]): MockableModule {
  return { config: { id }, ...(handlers ? { mockHandlers: async () => handlers } : {}) }
}

const MODULES = [
  mod('auth', [handler('auth-login')]),
  mod('orders', [handler('orders-list'), handler('orders-read')]),
  mod('reports', [handler('reports-list')]),
  mod('settings'),
  mod('users'),
  mod('billing'),
]

const STATIC = {
  users: [handler('users-list')],
  billing: [handler('billing-read')],
}

describe('selectMockHandlers', () => {
  it('takes the handlers a listed module contributes, and no other module’s', async () => {
    const selection = await selectMockHandlers(['orders'], MODULES, STATIC)

    expect(selection.handlers).toEqual([handler('orders-list'), handler('orders-read')])
    expect(selection.mocked).toEqual(['orders'])
    expect(selection.warnings).toEqual([])
  })

  it('takes a static set by the id of the module it belongs to', async () => {
    const selection = await selectMockHandlers(['users'], MODULES, STATIC)

    expect(selection.handlers).toEqual([handler('users-list')])
    expect(selection.mocked).toEqual(['users'])
    expect(selection.warnings).toEqual([])
  })

  it('takes both for a module that has both, its static set first', async () => {
    const modules = [mod('users', [handler('users-invite')])]

    const selection = await selectMockHandlers(['users'], modules, STATIC)

    expect(selection.handlers).toEqual([handler('users-list'), handler('users-invite')])
  })

  it('keeps the order the ids were listed in', async () => {
    const selection = await selectMockHandlers(['reports', 'billing', 'orders'], MODULES, STATIC)

    expect(selection.handlers).toEqual([
      handler('reports-list'),
      handler('billing-read'),
      handler('orders-list'),
      handler('orders-read'),
    ])
    expect(selection.mocked).toEqual(['reports', 'billing', 'orders'])
  })

  it('never calls the factory of a module that was not listed', async () => {
    const unlisted = vi.fn(async () => [handler('customers-list')])
    const modules = [...MODULES, { config: { id: 'customers' }, mockHandlers: unlisted }]

    await selectMockHandlers(['orders'], modules, STATIC)

    expect(unlisted).not.toHaveBeenCalled()
  })

  it('selects nothing for an empty list', async () => {
    const selection = await selectMockHandlers([], MODULES, STATIC)

    expect(selection).toEqual({ handlers: [], mocked: [], warnings: [] })
  })

  it('warns about an id that names no module, with the ids that can be mocked', async () => {
    const selection = await selectMockHandlers(['orders', 'invoices'], MODULES, STATIC)

    // The module that exists is still mocked.
    expect(selection.mocked).toEqual(['orders'])
    expect(selection.warnings).toEqual([
      'VUESTRATA_MOCK_ONLY lists "invoices", which is not a module of this app, so nothing is ' +
        'mocked for it. The ids that can be mocked: billing, orders, reports, users.',
    ])
  })

  it('does not offer "auth" among them: a real adapter owns /auth/*', async () => {
    const [warning] = (await selectMockHandlers(['nope'], MODULES, STATIC)).warnings

    expect(warning).not.toMatch(/\bauth\b/)
  })

  it('matches an id exactly: no prefix, no other case', async () => {
    const selection = await selectMockHandlers(
      ['order', 'Orders', 'orders-archive'],
      MODULES,
      STATIC,
    )

    expect(selection.handlers).toEqual([])
    expect(selection.warnings).toHaveLength(3)
  })

  it('says so when a listed module exists and has nothing to mock', async () => {
    const selection = await selectMockHandlers(['settings'], MODULES, STATIC)

    expect(selection.handlers).toEqual([])
    expect(selection.mocked).toEqual([])
    expect(selection.warnings).toEqual([
      expect.stringMatching(
        /^VUESTRATA_MOCK_ONLY lists "settings", and that module has no mock handlers: its requests go to the backend/,
      ),
    ])
  })

  it('skips a module whose handlers fail to load, and keeps the others', async () => {
    const broken: MockableModule = {
      config: { id: 'reports' },
      mockHandlers: async () => {
        throw new Error('chunk failed to load')
      },
    }

    const selection = await selectMockHandlers(
      ['reports', 'orders'],
      [broken, mod('orders', [handler('orders-list')])],
      STATIC,
    )

    expect(selection.handlers).toEqual([handler('orders-list')])
    expect(selection.mocked).toEqual(['orders'])
    // The failure is logged as an error; it is not also called "no handlers".
    expect(selection.warnings).toEqual([])
  })

  it('does not read a set through the prototype of the sets object', async () => {
    const selection = await selectMockHandlers(['constructor', 'to-string'], MODULES, STATIC)

    expect(selection.handlers).toEqual([])
  })

  describe('beside a handlers file kept from before 1.1.0, which exports no handlerSets', () => {
    it('still selects what the modules contribute', async () => {
      const selection = await selectMockHandlers(['orders'], MODULES, undefined)

      expect(selection.handlers).toEqual([handler('orders-list'), handler('orders-read')])
    })

    it('selects none of the static handlers, and says how to give them an id', async () => {
      const selection = await selectMockHandlers(['users'], MODULES, undefined)

      expect(selection.handlers).toEqual([])
      expect(selection.warnings).toEqual([
        expect.stringMatching(/lists "users", and that module has no mock handlers/),
        expect.stringMatching(
          /^src\/modules\/app\/mocks\/handlers\/index\.ts exports no `handlerSets`.*Export them by module id/,
        ),
      ])
    })
  })
})

describe('the static handler sets Vuestrata ships', () => {
  it('give every static handler to exactly one module', () => {
    const inSets = Object.values(handlerSets).flat()

    expect(inSets).toHaveLength(staticHandlers.length)
    expect(new Set(inSets)).toEqual(new Set(staticHandlers))
  })

  it('are keyed by the ids of registered modules', () => {
    const ids = new Set(appModules.map((module) => module.config.id))

    expect(Object.keys(handlerSets).sort()).toEqual(['analytics', 'billing', 'users'])
    for (const id of Object.keys(handlerSets)) expect(ids).toContain(id)
  })

  it('put the dashboard and the audit log with analytics, which is what calls them', () => {
    const paths = (handlerSets.analytics as unknown as { info: { path: string } }[]).map(
      (entry) => entry.info.path,
    )

    expect(paths.every((path) => /\/(dashboard\/|audit-logs$)/.test(path))).toBe(true)
    expect(paths).toHaveLength(10)
  })

  /**
   * The ids the docs list as mockable: every module with a `mockHandlers`
   * factory or a static set, except `auth`. If this changes, so does the list in
   * docs/1.getting-started/4.develop-against-your-backend.md.
   */
  it('together with the modules, make these ids mockable', async () => {
    const { warnings } = await selectMockHandlers(['nope'], appModules, handlerSets)

    expect(warnings[0]).toContain(
      'The ids that can be mocked: analytics, billing, calendar, catalog, customers, messages, ' +
        'orders, projects, reports, team, users.',
    )
  })
})
