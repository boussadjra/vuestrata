import { z } from 'zod'

import { createI18nMessages, type I18nValidationMessages, type ValidationTranslate } from './i18n'

/**
 * Zod's messages, in the user's language.
 *
 * A schema that says `z.string().min(2)` and nothing else used to render zod's
 * own English ("Too small: expected string to have >=2 characters") to a French
 * or an Arabic reader, and a field left empty read "Invalid input: expected
 * string, received undefined". This map answers the issues a form produces
 * from the `validation.*` catalog instead.
 *
 * It only fills the gap: zod asks a schema for its own message first, so
 * `z.string().min(2, t('profile_name_too_short'))` still says what it says.
 *
 * Framework-agnostic: it takes the translate function rather than importing an
 * i18n library. `bootstrap/validation-messages.ts` binds it to vue-i18n. The
 * translation is looked up when an issue is described, not when the map is
 * built, so the next validation after a language switch is in the new language.
 */

type RawIssue = z.core.$ZodRawIssue

/** Describes one zod issue, or leaves it to zod by returning `undefined`. */
export type ZodErrorMap = (issue: RawIssue) => string | undefined

export interface ZodErrorMapOptions {
  /**
   * How a date limit reads in a message (`z.date().min(…)`). Defaults to the
   * ISO date, `2026-01-31`, which is unambiguous in every locale.
   */
  formatDate?: (date: Date) => string
}

function isoDate(date: Date): string {
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/** Nothing was entered, as opposed to something wrong. */
function isMissing(input: unknown): boolean {
  return input === undefined || input === null
}

const UUID_FORMATS = new Set(['uuid', 'uuidv4', 'uuidv6', 'uuidv7', 'guid'])
const DATE_FORMATS = new Set(['date', 'datetime'])
const COUNTED_ORIGINS = new Set(['array', 'set'])

function describeLimit(
  issue: RawIssue,
  bound: 'min' | 'max',
  limit: number | bigint,
  messages: I18nValidationMessages,
  formatDate: (date: Date) => string,
): string {
  const origin = typeof issue.origin === 'string' ? issue.origin : ''
  const exact = issue.exact === true
  const exclusive = issue.inclusive === false

  if (origin === 'string') {
    if (exact) return messages.stringLength(limit)
    // `.min(1)` is how a schema says "required" for a text field, and "must be
    // at least 1 character" is a strange way to tell someone a box is empty.
    if (bound === 'min') return limit === 1 ? messages.required() : messages.stringMin(limit)
    return messages.stringMax(limit)
  }

  if (COUNTED_ORIGINS.has(origin)) {
    if (exact) return messages.arrayLength(limit)
    return bound === 'min' ? messages.arrayMin(limit) : messages.arrayMax(limit)
  }

  if (origin === 'date') {
    const date = formatDate(new Date(Number(limit)))
    return bound === 'min' ? messages.dateMin(date) : messages.dateMax(date)
  }

  if (bound === 'min') {
    if (!exclusive) return messages.min(limit)
    return limit === 0 || limit === 0n ? messages.positive() : messages.greaterThan(limit)
  }
  return exclusive ? messages.lessThan(limit) : messages.max(limit)
}

function describeFormat(issue: RawIssue, messages: I18nValidationMessages): string {
  const format = typeof issue.format === 'string' ? issue.format : ''
  if (format === 'email') return messages.email()
  if (format === 'url') return messages.url()
  if (UUID_FORMATS.has(format)) return messages.uuid()
  if (DATE_FORMATS.has(format)) return messages.date()
  if (format === 'starts_with' && typeof issue.prefix === 'string') {
    return messages.startsWith(issue.prefix)
  }
  if (format === 'ends_with' && typeof issue.suffix === 'string') {
    return messages.endsWith(issue.suffix)
  }
  if (format === 'includes' && typeof issue.includes === 'string') {
    return messages.includes(issue.includes)
  }
  return messages.pattern()
}

function describeType(issue: RawIssue, messages: I18nValidationMessages): string {
  if (isMissing(issue.input) || issue.expected === 'nonoptional') return messages.required()
  switch (issue.expected) {
    case 'number':
    case 'bigint':
      return messages.numeric()
    case 'int':
      return messages.integer()
    case 'date':
      return messages.date()
    default:
      return messages.invalidType()
  }
}

function describeIssue(
  issue: RawIssue,
  messages: I18nValidationMessages,
  formatDate: (date: Date) => string,
): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return describeType(issue, messages)
    case 'too_small':
      return describeLimit(issue, 'min', issue.minimum, messages, formatDate)
    case 'too_big':
      return describeLimit(issue, 'max', issue.maximum, messages, formatDate)
    case 'invalid_format':
      return describeFormat(issue, messages)
    case 'invalid_value':
      // An empty select sends '' to an enum: nothing was chosen, which is not
      // the same complaint as a value that is not on the list.
      return isMissing(issue.input) || issue.input === ''
        ? messages.required()
        : messages.invalidOption()
    case 'not_multiple_of':
      return messages.multipleOf(issue.divisor)
    case 'custom':
    case 'invalid_union':
      return messages.invalid()
    default:
      // `unrecognized_keys`, `invalid_key`, `invalid_element`: nothing a person
      // filling in a form can act on, and zod's own text names the key, which
      // is what the developer reading it needs.
      return undefined
  }
}

/**
 * Build the error map. `t` is called for every issue, so it must read the
 * active locale each time (vue-i18n's global `t` does).
 *
 * An issue whose key has no translation is left to zod: a readable English
 * sentence is better than `validation.string_min` on someone's screen.
 */
export function createZodErrorMap(
  t: ValidationTranslate,
  options: ZodErrorMapOptions = {},
): ZodErrorMap {
  const formatDate = options.formatDate ?? isoDate
  const lookup = { missed: false }
  const messages = createI18nMessages((key, named, plural) => {
    const text = t(key, named, plural)
    // A translate function answers with the key itself when it has no entry.
    if (!text || text === key) lookup.missed = true
    return text
  })

  return (issue) => {
    lookup.missed = false
    const message = describeIssue(issue, messages, formatDate)
    return lookup.missed ? undefined : message
  }
}

/** Marks the function this module installed, so installing again replaces it. */
const INSTALLED = Symbol.for('vuestrata.validation.zodErrorMap')

type ZodCustomError = NonNullable<z.core.$ZodConfig['customError']>
type InstalledErrorMap = ZodCustomError & { [INSTALLED]?: { previous?: ZodCustomError } }

/**
 * Install the map as zod's `customError`, for every schema in the app.
 *
 * Zod's order is unchanged above it: a message set on the schema, then one
 * passed to `parse()`, and only then this. A `customError` the project had
 * already installed keeps the first say, and this map answers what it leaves.
 *
 * Returns a function that puts back what was there. Installing twice replaces
 * the first installation rather than stacking on it.
 */
export function installZodErrorMap(
  t: ValidationTranslate,
  options: ZodErrorMapOptions = {},
): () => void {
  const current = z.config().customError as InstalledErrorMap | undefined
  const previous = current?.[INSTALLED] ? current[INSTALLED].previous : current
  const map = createZodErrorMap(t, options)

  const installed: InstalledErrorMap = (issue) => previous?.(issue) ?? map(issue)
  installed[INSTALLED] = { previous }
  z.config({ customError: installed })

  return () => {
    if (z.config().customError === installed) z.config({ customError: previous })
  }
}
