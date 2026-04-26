import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vite-plus/test'

import settingsModule, { useSettingsStore } from '../index'

describe('settings module', () => {
  describe('module definition', () => {
    it('has the correct config id', () => {
      expect(settingsModule.config.id).toBe('settings')
    })

    it('is enabled by default', () => {
      expect(settingsModule.config.enabledByDefault).toBe(true)
    })

    it('requires no permissions (universal access)', () => {
      expect(settingsModule.config.permissions).toHaveLength(0)
    })

    it('contributes a nav item pointing to settings page', () => {
      expect(settingsModule.navItems).toHaveLength(1)
      expect(settingsModule.navItems![0]!.to).toBe('/dashboard/settings')
    })

    it('provides i18n for en, fr, and ar', () => {
      expect(settingsModule.i18n).toBeDefined()
      expect(settingsModule.i18n!['en']).toBeDefined()
      expect(settingsModule.i18n!['fr']).toBeDefined()
      expect(settingsModule.i18n!['ar']).toBeDefined()
    })
  })

  describe('useSettingsStore', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
    })

    it('initializes with comfortable density', () => {
      const store = useSettingsStore()
      expect(store.displayDensity).toBe('comfortable')
    })

    it('initializes with default page size 20', () => {
      const store = useSettingsStore()
      expect(store.defaultPageSize).toBe(20)
    })

    it('sets display density', () => {
      const store = useSettingsStore()
      store.setDisplayDensity('compact')
      expect(store.displayDensity).toBe('compact')
    })

    it('sets default page size', () => {
      const store = useSettingsStore()
      store.setDefaultPageSize(50)
      expect(store.defaultPageSize).toBe(50)
    })

    it('toggles feature flags', () => {
      const store = useSettingsStore()
      store.setFeatureFlag('my-feature', true)
      expect(store.isFeatureEnabled('my-feature')).toBe(true)
      store.setFeatureFlag('my-feature', false)
      expect(store.isFeatureEnabled('my-feature')).toBe(false)
    })

    it('reports false for unknown feature flags', () => {
      const store = useSettingsStore()
      expect(store.isFeatureEnabled('non-existent-flag')).toBe(false)
    })

    it('resets to defaults', () => {
      const store = useSettingsStore()
      store.setDisplayDensity('compact')
      store.setDefaultPageSize(100)
      store.resetToDefaults()
      expect(store.displayDensity).toBe('comfortable')
      expect(store.defaultPageSize).toBe(20)
    })
  })
})
