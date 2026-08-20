import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vite-plus/test'

import { useModuleStore } from '@/modules'
import type { ModuleDefinition } from '@/modules/types'

function createModule(
  id: string,
  overrides: Partial<ModuleDefinition['config']> = {},
): ModuleDefinition {
  return {
    config: {
      id,
      name: id,
      description: `${id} module`,
      version: '1.0.0',
      category: 'system',
      ...overrides,
    },
  }
}

describe('module persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('should persist enabled module ids as an array', async () => {
    const store = useModuleStore()

    await store.initModules([createModule('catalog')])
    await store.enableModule('catalog')

    expect(store.enabledModules.has('catalog')).toBe(true)
    expect(localStorage.getItem('vuestrata-enabled-modules')).toBe(JSON.stringify(['catalog']))
  })

  it('should restore enabled modules from persisted storage on init', async () => {
    localStorage.setItem('vuestrata-enabled-modules', JSON.stringify(['orders']))

    const store = useModuleStore()
    await store.initModules([createModule('orders')])

    expect(store.enabledModules.has('orders')).toBe(true)
  })

  it('should always enable required modules alongside persisted modules', async () => {
    localStorage.setItem('vuestrata-enabled-modules', JSON.stringify(['orders']))

    const store = useModuleStore()
    await store.initModules([
      createModule('auth', { required: true, enabledByDefault: true }),
      createModule('orders'),
    ])

    expect(store.enabledModules.has('auth')).toBe(true)
    expect(store.enabledModules.has('orders')).toBe(true)
  })

  it('should fall back safely on malformed enabled-modules storage', async () => {
    localStorage.setItem('vuestrata-enabled-modules', '{bad-json')

    const store = useModuleStore()
    await store.initModules([createModule('inventory', { enabledByDefault: true })])

    expect(store.enabledModules.has('inventory')).toBe(true)
  })

  it('should enable module dependencies before the requested module', async () => {
    const store = useModuleStore()

    await store.initModules([
      createModule('shared'),
      createModule('checkout', { dependencies: ['shared'] }),
    ])

    await store.enableModule('checkout')

    expect(store.enabledModules.has('shared')).toBe(true)
    expect(store.enabledModules.has('checkout')).toBe(true)
  })
})

describe('module defaults after the first boot', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /**
   * The persisted list used to win outright whenever it was non-empty, so a
   * module added after a visitor's first boot — which is what `gen:module`
   * produces — never enabled: no routes, no nav entry, and no error saying so.
   */
  it('should enable a default module the browser has not seen before', async () => {
    localStorage.setItem('vuestrata-enabled-modules', JSON.stringify(['orders']))
    localStorage.setItem('vuestrata-known-modules', JSON.stringify(['orders']))

    const store = useModuleStore()
    await store.initModules([
      createModule('orders'),
      createModule('invoices', { enabledByDefault: true }),
    ])

    expect(store.enabledModules.has('invoices')).toBe(true)
    expect(store.enabledModules.has('orders')).toBe(true)
  })

  it('should leave a known default module disabled once it has been turned off', async () => {
    localStorage.setItem('vuestrata-enabled-modules', JSON.stringify(['orders']))
    localStorage.setItem('vuestrata-known-modules', JSON.stringify(['orders', 'calendar']))

    const store = useModuleStore()
    await store.initModules([
      createModule('orders'),
      createModule('calendar', { enabledByDefault: true }),
    ])

    expect(store.enabledModules.has('calendar')).toBe(false)
  })

  it('should record every registered module as known', async () => {
    const store = useModuleStore()
    await store.initModules([createModule('orders'), createModule('calendar')])

    expect(JSON.parse(localStorage.getItem('vuestrata-known-modules') ?? '[]')).toEqual([
      'orders',
      'calendar',
    ])
  })
})
