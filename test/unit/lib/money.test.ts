import { describe, expect, it } from 'vite-plus/test'

import { money, sumMoney, toMajorUnits, toMinorUnits } from '~/lib/money'

describe('toMajorUnits / toMinorUnits', () => {
  it('converts cents to dollars without float-formatting', () => {
    expect(toMajorUnits(640_000)).toBe(6400)
    expect(toMajorUnits(4_523_100)).toBe(45231)
  })

  it('rounds back to integer cents', () => {
    expect(toMinorUnits(6400)).toBe(640_000)
    expect(toMinorUnits(12.345)).toBe(1235)
  })
})

describe('sumMoney', () => {
  it('adds amounts that share a currency', () => {
    expect(sumMoney([money(100, 'USD'), money(50, 'USD')])).toEqual(money(150, 'USD'))
  })

  it('refuses mixed currencies', () => {
    expect(() => sumMoney([money(100, 'USD'), money(50, 'EUR')])).toThrow(/exchange rate/)
  })
})
