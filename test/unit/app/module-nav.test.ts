import { setActivePinia, createPinia } from 'pinia'
import { describe, expect, it, beforeEach } from 'vitest'

import { isBranchActive, matchesRoute } from '@/composables/useModuleNav'
import { useModuleStore } from '~/modules'
import {
  NAV_GROUPS,
  resolveNavGroup,
  isKnownNavGroup,
  DEFAULT_NAV_GROUP,
} from '~/modules/nav-groups'
import type { ModuleDefinition } from '~/modules/types'

describe('matchesRoute', () => {
  it('matches the exact path', () => {
    expect(matchesRoute('/dashboard/orders', '/dashboard/orders')).toBe(true)
  })

  it('matches descendants so a section stays active on its detail pages', () => {
    expect(matchesRoute('/dashboard/orders/ORD-1042', '/dashboard/orders')).toBe(true)
  })

  it('does not match a sibling that merely shares a prefix', () => {
    // The bug this guards: `startsWith('/dashboard/order')` lights up
    // `/dashboard/orders` too. The boundary has to be a path separator.
    expect(matchesRoute('/dashboard/orders', '/dashboard/order')).toBe(false)
  })

  it('ignores trailing slashes on both sides', () => {
    expect(matchesRoute('/dashboard/orders/', '/dashboard/orders')).toBe(true)
    expect(matchesRoute('/dashboard/orders', '/dashboard/orders/')).toBe(true)
  })

  it('only matches its own path when exact', () => {
    expect(matchesRoute('/dashboard', '/dashboard', true)).toBe(true)
    expect(matchesRoute('/dashboard/charts', '/dashboard', true)).toBe(false)
  })

  it('never prefix-matches the root, which would be active everywhere', () => {
    expect(matchesRoute('/dashboard', '/')).toBe(false)
    expect(matchesRoute('/', '/')).toBe(true)
  })

  it('is false for a parent with no route of its own', () => {
    expect(matchesRoute('/dashboard/orders', undefined)).toBe(false)
  })
})

describe('isBranchActive', () => {
  const item = {
    label: 'nav_orders',
    icon: 'shopping-cart',
    children: [
      { label: 'nav_orders_list', icon: 'list', to: '/dashboard/orders' },
      { label: 'nav_orders_new', icon: 'document-add', to: '/dashboard/orders/new' },
    ],
  }

  it('is true when a descendant is the current page', () => {
    expect(isBranchActive('/dashboard/orders/new', item)).toBe(true)
  })

  it('is false when nothing beneath it matches', () => {
    expect(isBranchActive('/dashboard/billing', item)).toBe(false)
  })

  it('searches deeply, not just the first level', () => {
    const nested = {
      label: 'a',
      icon: 'folder',
      children: [
        { label: 'b', icon: 'folder', children: [{ label: 'c', icon: 'file', to: '/x/y' }] },
      ],
    }
    expect(isBranchActive('/x/y', nested)).toBe(true)
  })
})

describe('nav group registry', () => {
  it('resolves a known id', () => {
    expect(resolveNavGroup('commerce').id).toBe('commerce')
  })

  it('falls back rather than dropping an item with an unknown group', () => {
    // Hiding a navigation entry because of a typo in a module barrel is a much
    // worse failure than showing it under the wrong heading.
    expect(resolveNavGroup('typo').id).toBe(DEFAULT_NAV_GROUP)
    expect(resolveNavGroup(undefined).id).toBe(DEFAULT_NAV_GROUP)
    expect(isKnownNavGroup('typo')).toBe(false)
  })

  it('has unique ids and no duplicate orders', () => {
    expect(new Set(NAV_GROUPS.map((g) => g.id)).size).toBe(NAV_GROUPS.length)
    expect(new Set(NAV_GROUPS.map((g) => g.order)).size).toBe(NAV_GROUPS.length)
  })
})

function defineTestModule(id: string, navItems: ModuleDefinition['navItems']): ModuleDefinition {
  return {
    config: { id, name: id, description: '', version: '1.0.0', category: 'content' },
    navItems,
  }
}

describe('moduleStore.navGroups', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('buckets items by group and drops empty sections', async () => {
    const store = useModuleStore()
    store.registerModule(
      defineTestModule('a', [
        { label: 'x', icon: 'file', to: '/x', group: 'commerce', order: 2 },
        { label: 'y', icon: 'file', to: '/y', group: 'overview', order: 1 },
      ]),
    )
    await store.enableModule('a')

    const groups = store.navGroups
    expect(groups.map((group) => group.id)).toEqual(['overview', 'commerce'])
    // 'work', 'organization', 'account' and 'reference' contributed nothing and
    // must not render as bare headings.
    expect(groups).toHaveLength(2)
  })

  it('orders sections by the registry, not by contribution order', async () => {
    const store = useModuleStore()
    store.registerModule(
      defineTestModule('late', [{ label: 'r', icon: 'file', to: '/r', group: 'reference' }]),
    )
    store.registerModule(
      defineTestModule('early', [{ label: 'o', icon: 'file', to: '/o', group: 'overview' }]),
    )
    await store.enableModule('late')
    await store.enableModule('early')

    expect(store.navGroups.map((group) => group.id)).toEqual(['overview', 'reference'])
  })

  it('routes an ungrouped item to the default group', async () => {
    const store = useModuleStore()
    store.registerModule(defineTestModule('a', [{ label: 'x', icon: 'file', to: '/x' }]))
    await store.enableModule('a')

    expect(store.navGroups[0]?.id).toBe(DEFAULT_NAV_GROUP)
  })
})
