import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import {
  humanizePermission,
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
})
