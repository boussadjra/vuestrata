import { useI18n } from 'vue-i18n'

/**
 * Locale-aware value formatting.
 *
 * Everything goes through `Intl`, never string concatenation. The dashboard
 * previously shipped pre-formatted strings from the API (`"$45,231"`), which
 * hardcodes the symbol, the grouping separator, and the symbol's position for
 * every locale at once — and produces `"$45,231"` for an Arabic reader who
 * expects `٤٥٬٢٣١` and a right-positioned symbol.
 *
 * `Intl` formatters are relatively expensive to construct, so they are cached
 * per locale+options rather than rebuilt on every render.
 */
export function useFormatters() {
  const { locale } = useI18n()

  const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>()

  function cached<T>(key: string, build: () => T): T {
    const existing = cache.get(key)
    if (existing) return existing as T
    const created = build()
    cache.set(key, created as never)
    return created
  }

  /**
   * Money, from a MINOR-unit integer.
   *
   * Minor units avoid float drift (0.1 + 0.2 is not 0.3), which is why the API
   * sends cents rather than dollars.
   */
  function currency(minorUnits: number, currencyCode: string, compact = false): string {
    const key = `cur:${locale.value}:${currencyCode}:${compact}`
    const formatter = cached(
      key,
      () =>
        new Intl.NumberFormat(locale.value, {
          style: 'currency',
          currency: currencyCode,
          notation: compact ? 'compact' : 'standard',
          maximumFractionDigits: compact ? 1 : 2,
        }),
    ) as Intl.NumberFormat
    return formatter.format(minorUnits / 100)
  }

  function number(value: number, compact = false): string {
    const key = `num:${locale.value}:${compact}`
    const formatter = cached(
      key,
      () =>
        new Intl.NumberFormat(locale.value, {
          notation: compact ? 'compact' : 'standard',
          maximumFractionDigits: compact ? 1 : 0,
        }),
    ) as Intl.NumberFormat
    return formatter.format(value)
  }

  /** `value` is the percentage itself (12.5 → "12.5%"), not a 0–1 fraction. */
  function percent(value: number, fractionDigits = 1): string {
    const key = `pct:${locale.value}:${fractionDigits}`
    const formatter = cached(
      key,
      () =>
        new Intl.NumberFormat(locale.value, {
          style: 'percent',
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }),
    ) as Intl.NumberFormat
    return formatter.format(value / 100)
  }

  /** Signed percentage for deltas, so "+12.5%" reads as a change, not a value. */
  function signedPercent(value: number, fractionDigits = 1): string {
    const key = `spct:${locale.value}:${fractionDigits}`
    const formatter = cached(
      key,
      () =>
        new Intl.NumberFormat(locale.value, {
          style: 'percent',
          signDisplay: 'exceptZero',
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }),
    ) as Intl.NumberFormat
    return formatter.format(value / 100)
  }

  function date(
    value: string | Date,
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
  ): string {
    const key = `date:${locale.value}:${JSON.stringify(options)}`
    const formatter = cached(
      key,
      () => new Intl.DateTimeFormat(locale.value, options),
    ) as Intl.DateTimeFormat
    return formatter.format(typeof value === 'string' ? new Date(value) : value)
  }

  function dateTime(value: string | Date): string {
    return date(value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  /**
   * Time of day only.
   *
   * Deliberately not `HH:mm` by hand: whether a locale uses a 24-hour clock, a
   * 12-hour clock with AM/PM, or Arabic-Indic digits is a property of the
   * locale, and `Intl` is the only thing that knows.
   */
  function time(value: string | Date): string {
    return date(value, { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * "3 hours ago" / "in 2 days", localized.
   *
   * Hand-rolled `${n}h ago` strings — which this codebase had — are English-only
   * and get the pluralization wrong in most other languages.
   */
  function relativeTime(value: string | Date): string {
    const formatter = cached(
      `rel:${locale.value}`,
      () => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }),
    ) as Intl.RelativeTimeFormat

    const target = typeof value === 'string' ? new Date(value) : value
    const diffSeconds = (target.getTime() - Date.now()) / 1000

    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 60 * 60 * 24 * 365],
      ['month', 60 * 60 * 24 * 30],
      ['day', 60 * 60 * 24],
      ['hour', 60 * 60],
      ['minute', 60],
    ]

    for (const [unit, seconds] of units) {
      if (Math.abs(diffSeconds) >= seconds) {
        return formatter.format(Math.round(diffSeconds / seconds), unit)
      }
    }
    return formatter.format(Math.round(diffSeconds), 'second')
  }

  return { currency, number, percent, signedPercent, date, dateTime, time, relativeTime }
}
