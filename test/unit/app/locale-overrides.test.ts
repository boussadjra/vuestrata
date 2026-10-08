import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import en from '@/locales/en.json'

/**
 * `<locale>.overrides.json` on top of the shipped catalog, as `plugins/i18n.ts`
 * merges them.
 *
 * The catalog was flat until it gained a group (`validation`), and a merge
 * one level deep then replaced the whole group for an override of one key:
 * every other message in it was shown as `validation.email`.
 */

async function i18nWith(overrides: Record<string, unknown>) {
  vi.resetModules()
  vi.doMock('@/locales/en.overrides.json', () => ({ default: overrides }))
  const { i18n } = await import('@/plugins/i18n')
  const { global } = i18n
  return {
    t: (key: string, named: Record<string, unknown> = {}, plural?: number) =>
      plural === undefined ? global.t(key, named) : global.t(key, named, plural),
    te: (key: string) => global.te(key),
    tm: (key: string) => global.tm(key) as unknown[],
  }
}

afterEach(() => {
  vi.doUnmock('@/locales/en.overrides.json')
  vi.resetModules()
})

describe('an override in <locale>.overrides.json', () => {
  it('rewords one message of a group and leaves the others as shipped', async () => {
    const { t, te } = await i18nWith({ validation: { email: 'That is not an email address' } })

    expect(t('validation.email')).toBe('That is not an email address')
    expect(t('validation.string_min', { min: 3 }, 3)).toBe('Must be at least 3 characters')
    for (const key of Object.keys(en.validation)) {
      expect(te(`validation.${key}`), key).toBe(true)
    }
  })

  it('still rewords a flat key, and adds one of the project’s own', async () => {
    const { t } = await i18nWith({ common_save: 'Store', acme_greeting: 'Hello from Acme' })

    expect(t('common_save')).toBe('Store')
    expect(t('acme_greeting')).toBe('Hello from Acme')
    expect(t('common_cancel')).toBe('Cancel')
  })

  it('adds a group of the project’s own, and a key to a shipped group', async () => {
    const { t } = await i18nWith({
      acme: { billing: { title: 'Invoices' } },
      validation: { acme_vat: 'Not a VAT number' },
    })

    expect(t('acme.billing.title')).toBe('Invoices')
    expect(t('validation.acme_vat')).toBe('Not a VAT number')
    expect(t('validation.required', { field: 'Name' })).toBe('Name is required')
  })

  it('replaces, not merges, where either side is not a group', async () => {
    const { t, tm } = await i18nWith({
      // A string where the catalog has a group: the project's word is final.
      validation: 'No validation messages here',
      acme_steps: ['one', 'two'],
    })

    expect(t('validation')).toBe('No validation messages here')
    expect(tm('acme_steps')).toHaveLength(2)
  })

  // A build hands both files over compiled: every message is a syntax tree,
  // an object like a group is. Merging two of them key by key would leave the
  // plural branches of the shipped message inside the project's plain one.
  it('replaces a compiled message with a compiled message, whole', async () => {
    const compiledPlain = en.validation.email
    expect(typeof compiledPlain).toBe('object')
    const { t } = await i18nWith({ validation: { string_min: compiledPlain } })

    expect(t('validation.string_min', { min: 3 }, 3)).toBe('Please enter a valid email address')
    expect(t('validation.string_min', { min: 1 }, 1)).toBe('Please enter a valid email address')
    expect(t('validation.string_max', { max: 3 }, 3)).toBe('Must be at most 3 characters')
  })

  it('leaves the shipped catalog object as it was', async () => {
    const before = JSON.stringify(en.validation)

    await i18nWith({ validation: { email: 'changed' } })

    expect(JSON.stringify(en.validation)).toBe(before)
  })
})
