import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import {
  humanizePermission,
  permissionActionI18nKey,
  permissionActionRank,
  permissionI18nKey,
  usePermissionLabels,
} from '@/composables/usePermissionLabels'

type Labels = ReturnType<typeof usePermissionLabels>

function labelsFor(messages: Record<string, string>): Labels {
  let api!: Labels
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: messages } })
  const Harness = defineComponent({
    setup() {
      api = usePermissionLabels()
      return () => h('div')
    },
  })
  mount(Harness, { global: { plugins: [i18n] } })
  return api
}

describe('permission label helpers', () => {
  it('maps a permission token to its catalog key', () => {
    expect(permissionI18nKey('users:read')).toBe('perm_users_read')
  })

  it('humanizes an unknown permission instead of showing the raw token', () => {
    expect(humanizePermission('customers:read')).toBe('customers read')
  })

  it('uses the catalog label when the key exists', () => {
    const { permLabel, permNamespaceLabel } = labelsFor({
      perm_users_read: 'View Users',
      perm_ns_users: 'Users',
    })

    expect(permLabel('users:read')).toBe('View Users')
    expect(permNamespaceLabel('users')).toBe('Users')
  })

  it('falls back to words when the catalog has no entry', () => {
    const { permLabel, permNamespaceLabel } = labelsFor({})

    expect(permLabel('users:read')).toBe('users read')
    expect(permNamespaceLabel('users')).toBe('users')
  })

  it('maps a permission token to its action catalog key', () => {
    expect(permissionActionI18nKey('users:read')).toBe('perm_action_read')
  })

  it('orders known actions in CRUD sequence', () => {
    expect(permissionActionRank('users:read')).toBeLessThan(permissionActionRank('users:create'))
    expect(permissionActionRank('users:create')).toBeLessThan(permissionActionRank('users:update'))
    expect(permissionActionRank('users:delete')).toBeLessThan(permissionActionRank('users:manage'))
  })

  it('uses the action catalog label when the key exists', () => {
    const { permActionLabel } = labelsFor({
      perm_action_read: 'View',
      perm_users_read: 'View Users',
    })

    expect(permActionLabel('users:read')).toBe('View')
  })

  it('falls back to the action segment when the action catalog has no entry', () => {
    const { permActionLabel } = labelsFor({})

    expect(permActionLabel('users:read')).toBe('Read')
  })
})
