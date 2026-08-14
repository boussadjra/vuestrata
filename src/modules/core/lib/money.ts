/**
 * Money, once.
 *
 * Lifted out of the analytics module the moment a second domain needed it.
 * Currency is a cross-cutting primitive — orders, invoices, products and
 * dashboards all carry it — and a per-module copy of the schema is a per-module
 * chance to disagree about whether `amount` is cents or units.
 */
import { z } from 'zod'

/**
 * A MINOR-unit integer plus its ISO-4217 currency.
 *
 * Never a pre-formatted string: `"$45,231"` cannot be summed, compared, or
 * localized, and it hardcodes both the symbol and the grouping convention for
 * every locale. Never a float either — `0.1 + 0.2` is not `0.3`, and money that
 * is off by a hundredth of a cent per row is money that fails reconciliation.
 * The view formats it with `Intl.NumberFormat` via `useFormatters()`.
 */
export const moneySchema = z.object({
  /** Amount in the currency's smallest unit (cents, pence, …). */
  amount: z.number().int(),
  /** ISO-4217 code. */
  currency: z.string().length(3),
})

export type Money = z.infer<typeof moneySchema>

/** Build a `Money` from a minor-unit amount. */
export function money(amount: number, currency = 'USD'): Money {
  return { amount: Math.round(amount), currency }
}

/**
 * Minor units per major unit.
 *
 * `useFormatters().currency` and the dashboard charts both assume this ratio.
 * Zero-decimal currencies (JPY, …) are not in the demo payloads; if they
 * arrive, formatting has to learn ISO-4217 exponents rather than this constant.
 */
const MINOR_PER_MAJOR = 100

/** Chart scales and `Intl` formatting use major units; storage stays integer cents. */
export function toMajorUnits(minorUnits: number): number {
  return minorUnits / MINOR_PER_MAJOR
}

/** Inverse of `toMajorUnits`, rounded back to an integer minor unit. */
export function toMinorUnits(majorUnits: number): number {
  return Math.round(majorUnits * MINOR_PER_MAJOR)
}

/**
 * Sum amounts that share a currency.
 *
 * Throws on a mixed-currency list rather than adding the numbers: silently
 * treating 100 EUR as 100 USD produces a total that looks entirely plausible
 * and is wrong by whatever the exchange rate happens to be. Conversion needs a
 * rate and a date, which belong to the caller, not to an addition helper.
 */
export function sumMoney(values: readonly Money[], fallbackCurrency = 'USD'): Money {
  if (values.length === 0) return money(0, fallbackCurrency)

  const currency = values[0]!.currency
  let total = 0
  for (const value of values) {
    if (value.currency !== currency) {
      throw new Error(`Cannot sum ${currency} and ${value.currency} without an exchange rate`)
    }
    total += value.amount
  }
  return { amount: total, currency }
}
