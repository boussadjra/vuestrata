import { describe, it, expect } from 'vite-plus/test'

import billingModule, { PLANS, billingModuleKeys as billingKeys } from '../index'

describe('billing module', () => {
  describe('module definition', () => {
    it('has the correct config id', () => {
      expect(billingModule.config.id).toBe('billing')
    })

    it('is enabled by default', () => {
      expect(billingModule.config.enabledByDefault).toBe(true)
    })

    it('declares required permissions', () => {
      expect(billingModule.config.permissions).toContain('billing:read')
      expect(billingModule.config.permissions).toContain('billing:manage')
    })

    it('contributes a nav item', () => {
      expect(billingModule.navItems).toHaveLength(1)
      expect(billingModule.navItems![0]!.to).toBe('/dashboard/billing')
    })

    it('provides i18n for en, fr, and ar', () => {
      expect(billingModule.i18n).toBeDefined()
      expect(billingModule.i18n!['en']).toBeDefined()
      expect(billingModule.i18n!['fr']).toBeDefined()
      expect(billingModule.i18n!['ar']).toBeDefined()
    })
  })

  describe('PLANS', () => {
    it('exports a non-empty plans array', () => {
      expect(Array.isArray(PLANS)).toBe(true)
      expect(PLANS.length).toBeGreaterThan(0)
    })

    it('includes a free tier plan', () => {
      const free = PLANS.find((p) => p.tier === 'free')
      expect(free).toBeDefined()
      expect(free!.price.monthly).toBe(0)
    })

    it('includes a highlighted (recommended) plan', () => {
      const highlighted = PLANS.find((p) => p.highlighted)
      expect(highlighted).toBeDefined()
    })

    it('all plans have required fields', () => {
      for (const plan of PLANS) {
        expect(plan.id).toBeTruthy()
        expect(plan.name).toBeTruthy()
        expect(plan.tier).toBeTruthy()
        expect(plan.price).toBeDefined()
        expect(plan.limits).toBeDefined()
      }
    })
  })

  describe('billingKeys', () => {
    it('produces stable query keys', () => {
      expect(billingKeys.all).toEqual(['billing'])
      expect(billingKeys.data()).toEqual(['billing', 'data'])
    })
  })
})
