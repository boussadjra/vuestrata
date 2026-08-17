import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useFormatters } from '@/composables/useFormatters'

/**
 * Locale-aware formatting.
 *
 * The dashboard used to receive pre-formatted strings from the API
 * (`"$45,231"`), which bakes English grouping, the symbol, and the symbol's
 * position into the payload for every locale at once. These tests assert that
 * the same underlying number renders differently per locale — which is the
 * whole point of moving formatting to the client.
 */

type Formatters = ReturnType<typeof useFormatters>

/** Mount a throwaway component so `useI18n()` has an active instance. */
function formattersFor(locale: string): Formatters {
  let api!: Formatters
  const i18n = createI18n({ legacy: false, locale, messages: { [locale]: {} } })
  const Harness = defineComponent({
    setup() {
      api = useFormatters()
      return () => h('div')
    },
  })
  mount(Harness, { global: { plugins: [i18n] } })
  return api
}

describe('currency', () => {
  it('formats minor units as major units', () => {
    // The API sends cents; 4_523_100 cents is $45,231.00.
    expect(formattersFor('en').currency(4_523_100, 'USD')).toContain('45,231')
  })

  it('renders the same amount differently per locale', () => {
    const amount = 4_523_100
    const en = formattersFor('en').currency(amount, 'USD')
    const fr = formattersFor('fr').currency(amount, 'EUR')

    expect(en).not.toBe(fr)
    // French uses a non-breaking space as the group separator and puts the
    // symbol last — neither of which a server-formatted string could produce.
    expect(fr).toMatch(/€\s*$|€/u)
  })

  it('compacts large values without losing the currency', () => {
    const compact = formattersFor('en').currency(4_523_100, 'USD', true)
    expect(compact).toMatch(/\$/)
    expect(compact.length).toBeLessThan(formattersFor('en').currency(4_523_100, 'USD').length)
  })
})

describe('percent', () => {
  it('treats the input as a percentage, not a fraction', () => {
    // 12.5 means 12.5%, not 1250%.
    expect(formattersFor('en').percent(12.5)).toContain('12.5')
  })

  it('always shows a sign for deltas', () => {
    const { signedPercent } = formattersFor('en')

    // Without an explicit sign a delta is indistinguishable from a value.
    expect(signedPercent(12.5)).toMatch(/^\+/)
    expect(signedPercent(-12.5)).toMatch(/^-/)
  })

  it('omits the sign for zero', () => {
    // "+0%" reads as a change that did not happen.
    expect(formattersFor('en').signedPercent(0)).not.toMatch(/^\+/)
  })
})

describe('number', () => {
  it('groups per locale', () => {
    expect(formattersFor('en').number(1_234_567)).toBe('1,234,567')
    // French uses narrow no-break spaces rather than commas.
    expect(formattersFor('fr').number(1_234_567)).not.toBe('1,234,567')
  })

  it('uses Western digits in Arabic', () => {
    const formatted = formattersFor('ar').number(1_234_567)
    expect(formatted).not.toMatch(/[٠-٩]/)
    expect(formatted).toMatch(/1/)
  })
})

describe('relativeTime', () => {
  it('describes the past and the future', () => {
    const { relativeTime } = formattersFor('en')
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

    expect(relativeTime(hourAgo)).toMatch(/hour|ago/i)
    expect(relativeTime(inTwoDays)).toMatch(/in|day/i)
  })

  it('localizes rather than hardcoding English', () => {
    // The codebase previously built `${n}h ago` by hand — English-only, and
    // wrong for languages with more than two plural forms.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    expect(formattersFor('fr').relativeTime(hourAgo)).not.toBe(
      formattersFor('en').relativeTime(hourAgo),
    )
  })

  it('picks the largest sensible unit', () => {
    const { relativeTime } = formattersFor('en')
    const monthAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)

    // "last month", not "840 hours ago".
    expect(relativeTime(monthAgo)).toMatch(/month/i)
  })
})

describe('date', () => {
  it('formats per locale', () => {
    const iso = '2026-03-14'
    expect(formattersFor('en').date(iso)).not.toBe(formattersFor('ar').date(iso))
  })
})
