import { describe, it, expect } from 'vite-plus/test'

import { defineQueryKeys } from '@/lib/query-keys'
import { buildQueryString } from '@/lib/query-utils'
import { billingModuleKeys as billingKeys } from '~/modules/billing'
import { usersModuleKeys as usersKeys } from '~/modules/users'

describe('Query Key Factories', () => {
  describe('defineQueryKeys', () => {
    it('creates stable all key from module id', () => {
      const keys = defineQueryKeys('my-module')
      expect(keys.all).toEqual(['my-module'])
    })

    it('creates list key with optional params', () => {
      const keys = defineQueryKeys('my-module')
      expect(keys.list()).toEqual(['my-module', 'list', undefined])
      expect(keys.list({ page: 1 })).toEqual(['my-module', 'list', { page: 1 }])
    })

    it('creates detail key with id', () => {
      const keys = defineQueryKeys('my-module')
      expect(keys.detail('id-1')).toEqual(['my-module', 'detail', 'id-1'])
    })

    it('creates action key for custom queries', () => {
      const keys = defineQueryKeys('my-module')
      expect(keys.action('stats')).toEqual(['my-module', 'stats', undefined])
      expect(keys.action('export', { format: 'csv' })).toEqual([
        'my-module',
        'export',
        { format: 'csv' },
      ])
    })
  })

  describe('billingKeys', () => {
    it('all returns module-level key', () => {
      expect(billingKeys.all).toEqual(['billing'])
    })

    it('data returns static key', () => {
      expect(billingKeys.data()).toEqual(['billing', 'data'])
    })
  })

  describe('usersKeys', () => {
    it('all returns module-level key', () => {
      expect(usersKeys.all).toEqual(['users'])
    })

    it('list with params', () => {
      const params = { role: 'admin' }
      expect(usersKeys.list(params)).toEqual(['users', 'list', params])
    })
  })

  describe('key uniqueness', () => {
    it('module-level keys are distinct', () => {
      const allKeys = [billingKeys.all, usersKeys.all]
      const serialized = allKeys.map((k) => JSON.stringify(k))
      expect(new Set(serialized).size).toBe(allKeys.length)
    })
  })
})

describe('buildQueryString', () => {
  it('returns empty string for undefined', () => {
    expect(buildQueryString(undefined)).toBe('')
  })

  it('returns empty string for empty object', () => {
    expect(buildQueryString({})).toBe('')
  })

  it('skips null and undefined values', () => {
    expect(buildQueryString({ a: null, b: undefined, c: 'yes' })).toBe('c=yes')
  })

  it('skips empty string values', () => {
    expect(buildQueryString({ search: '', page: 1 })).toBe('page=1')
  })

  it('coerces numbers to strings', () => {
    expect(buildQueryString({ page: 2, pageSize: 50 })).toBe('page=2&pageSize=50')
  })

  it('serializes mixed params correctly', () => {
    const qs = buildQueryString({
      page: 1,
      pageSize: 25,
      search: 'shirt',
      status: 'active',
    })
    const parsed = new URLSearchParams(qs)
    expect(parsed.get('page')).toBe('1')
    expect(parsed.get('pageSize')).toBe('25')
    expect(parsed.get('search')).toBe('shirt')
    expect(parsed.get('status')).toBe('active')
  })
})
