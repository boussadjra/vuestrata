import { describe, it, expect } from 'vite-plus/test'

import { getI18n } from '@/plugins/i18n'

import usersModule, { usersModuleKeys } from '../index'

describe('users module', () => {
  describe('module definition', () => {
    it('has the correct config id', () => {
      expect(usersModule.config.id).toBe('users')
    })

    it('is enabled by default', () => {
      expect(usersModule.config.enabledByDefault).toBe(true)
    })

    it('declares required permissions', () => {
      expect(usersModule.config.permissions).toContain('users:read')
      expect(usersModule.config.permissions).toContain('users:manage')
    })

    it('contributes a nav item', () => {
      expect(usersModule.navItems).toHaveLength(1)
      expect(usersModule.navItems![0]!.to).toBe('/dashboard/users')
    })

    it('provides English metadata and discovered French and Arabic messages', () => {
      expect(usersModule.i18n).toBeDefined()
      expect(usersModule.i18n!['en']).toBeDefined()
      const key = Object.keys(usersModule.i18n!.en!)[0]!
      for (const locale of ['en', 'fr', 'ar']) expect(getI18n().global.te(key, locale)).toBe(true)
    })
  })

  describe('usersModuleKeys', () => {
    it('all() returns stable base key', () => {
      expect(usersModuleKeys.all).toEqual(['users'])
    })

    it('list() includes params in key', () => {
      const key = usersModuleKeys.list({ page: 1, role: 'admin' })
      expect(key[0]).toBe('users')
      expect(key[1]).toBe('list')
    })

    it('detail() includes id in key', () => {
      const key = usersModuleKeys.detail('u-123')
      expect(key).toContain('u-123')
    })
  })
})
