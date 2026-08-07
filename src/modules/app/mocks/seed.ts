/**
 * Deterministic fixture generation.
 *
 * Everything here is seeded. `Math.random()` would give a demo that looks
 * different on every reload — a screenshot could not be reproduced, an e2e test
 * could not assert on a row, and "the chart looks wrong" would be unfalsifiable.
 * Same seed, same data, every time, in every browser.
 */

/**
 * Mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * Chosen over `seed = (seed * 9301 + 49297) % 233280`, the usual one-liner,
 * because that generator has visible short-period structure: sample it for a
 * seven-day series and consecutive days correlate, which shows up as a
 * suspiciously regular sawtooth in a line chart.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic integer in `[min, max]`, inclusive. */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** Deterministic element of a non-empty array. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

/** Deterministic subset of `count` distinct elements. */
export function pickMany<T>(rng: () => number, items: readonly T[], count: number): T[] {
  const pool = [...items]
  const chosen: T[] = []
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!)
  }
  return chosen
}

/**
 * A fixed "now" for the whole fixture set.
 *
 * Dates are generated as offsets from the moment the module is evaluated, so
 * "3 days ago" stays 3 days ago whenever the demo is opened rather than
 * drifting into "18 months ago" as a hardcoded date set would. Captured once so
 * every handler in a session agrees on what "today" means.
 */
export const SEED_NOW = new Date()

/** ISO timestamp `days` before (negative) or after (positive) the fixture epoch. */
export function daysFromNow(days: number, hour = 9, minute = 0): string {
  const date = new Date(SEED_NOW)
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

/** ISO timestamp `hours` before the fixture epoch. */
export function hoursAgo(hours: number): string {
  return new Date(SEED_NOW.getTime() - hours * 3_600_000).toISOString()
}

// ─── Name pools ───────────────────────────────────────────
//
// Deliberately varied in script and origin. A demo seeded entirely with
// "John Smith" and "Acme Corp" quietly teaches that names are ASCII, two words,
// and short — and then the layout breaks the first time a real customer named
// "Maria-Gabriela Fernández de la Vega" signs up. These strings exercise
// diacritics, non-Latin scripts, and long names against real column widths.

export const PEOPLE_NAMES = [
  'Amara Okonkwo',
  'Lucía Fernández',
  'Kenji Nakamura',
  'Fatima Al-Rashid',
  'Björn Lindqvist',
  'Priya Raghunathan',
  'Thomas Müller',
  'Chloé Beaumont',
  'Dmitri Volkov',
  'Grace Adeyemi',
  'Hyun-woo Park',
  'Isabella Rossi',
  'Omar Benali',
  'Sofia Kowalczyk',
  'Wei Zhang',
  'Nadia Haddad',
  'Ravi Krishnan',
  'Elena Petrova',
  'Marcus Johansson',
  'Aisha Diallo',
  'Rafael Oliveira',
  'Yuki Tanaka',
  'Ingrid Sørensen',
  'Samuel Adeyinka',
] as const

export const COMPANY_NAMES = [
  'Northwind Logistics',
  'Meridian Health',
  'Kestrel Analytics',
  'Blue Harbor Foods',
  'Verdant Energy',
  'Atlas Freight',
  'Sable & Finch',
  'Orbit Robotics',
  'Cedarline Interiors',
  'Halcyon Media',
  'Pinnacle Sports',
  'Lumen Diagnostics',
  'Fairweather Insurance',
  'Ironwood Manufacturing',
  'Beacon Learning',
  'Quantum Ledger',
] as const

export const CITIES = [
  { city: 'Lisbon', country: 'PT' },
  { city: 'Toronto', country: 'CA' },
  { city: 'Osaka', country: 'JP' },
  { city: 'Nairobi', country: 'KE' },
  { city: 'Hamburg', country: 'DE' },
  { city: 'Bengaluru', country: 'IN' },
  { city: 'São Paulo', country: 'BR' },
  { city: 'Casablanca', country: 'MA' },
  { city: 'Melbourne', country: 'AU' },
  { city: 'Warsaw', country: 'PL' },
] as const

/**
 * The Combining Diacritical Marks block, U+0300–U+036F.
 *
 * `normalize('NFD')` splits "é" into "e" followed by a combining acute; this
 * strips the accent and leaves the base letter. The characters in the range are
 * non-spacing, so the class looks oddly narrow in an editor — that is expected,
 * not a corrupted paste.
 */
const COMBINING_MARKS = /[̀-ͯ]/g

function transliterate(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

/** `Amara Okonkwo` → `amara.okonkwo` — stable, and safe in an email local part. */
export function slugifyName(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

/** `Northwind Logistics` → `northwind-logistics`. */
export function slugify(value: string): string {
  return transliterate(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Zero-padded sequential identifier, e.g. `ORD-1042`. */
export function sequentialId(prefix: string, index: number, start = 1000): string {
  return `${prefix}-${start + index}`
}
