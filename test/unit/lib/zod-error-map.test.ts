import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { z } from 'zod'

import { installValidationMessages } from '@/bootstrap/validation-messages'
import { getI18n } from '@/plugins/i18n'
import { createI18nMessages, type ValidationTranslate } from '~/lib/validation/i18n'
import { createZodErrorMap, installZodErrorMap } from '~/lib/validation/zod-error-map'

/**
 * Zod's messages in the user's language.
 *
 * The map is exercised the way a form meets it: installed as zod's
 * `customError` and read back from a failed `safeParse`. The translations come
 * from the catalogs the app ships, so a key renamed in one of them fails here.
 */

const i18n = getI18n()
const baseline = z.config().customError

type Locale = 'en' | 'fr' | 'ar'

function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
}

/**
 * A catalog entry, read through vue-i18n rather than from the JSON: the build
 * compiles the catalogs, so an imported one holds message functions, not text.
 */
function entry(
  locale: Locale,
  key: string,
  named: Record<string, string | number> = {},
  plural?: number,
): string {
  const translate = i18n.global.t as (
    key: string,
    named: Record<string, string | number>,
    options: { locale: Locale; plural?: number },
  ) => string
  return translate(
    `validation.${key}`,
    named,
    plural === undefined ? { locale } : { locale, plural },
  )
}

/** The first message a schema gives for a value it rejects. */
function messageOf(schema: z.ZodType, input: unknown): string {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the value to be rejected')
  return result.error.issues[0]!.message
}

function messagesOf(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

let uninstall: () => void

beforeEach(() => {
  setLocale('en')
  uninstall = installValidationMessages()
})

afterEach(() => {
  uninstall()
  z.config({ customError: baseline })
  setLocale('en')
})

describe('the issues a form produces, in English', () => {
  it('calls a value that was never entered required', () => {
    expect(messageOf(z.string(), undefined)).toBe('This field is required')
    expect(messageOf(z.string(), null)).toBe('This field is required')
    expect(messageOf(z.number(), undefined)).toBe('This field is required')
    // `.min(1)` is how a schema says "required" for a text input, which holds
    // an empty string rather than nothing.
    expect(messageOf(z.string().min(1), '')).toBe('This field is required')
    expect(messageOf(z.string().trim().min(1), '   ')).toBe('This field is required')
    // A select that was never opened holds '' too.
    expect(messageOf(z.enum(['draft', 'active']), '')).toBe('This field is required')
  })

  it('interpolates the limit of a text length', () => {
    expect(messageOf(z.string().min(3), 'ab')).toBe('Must be at least 3 characters')
    expect(messageOf(z.string().max(80), 'x'.repeat(81))).toBe('Must be at most 80 characters')
    expect(messageOf(z.string().length(6), 'abc')).toBe('Must be exactly 6 characters')
  })

  it('chooses the singular for a limit of one', () => {
    expect(messageOf(z.string().max(1), 'ab')).toBe('Must be at most 1 character')
    expect(messageOf(z.string().length(1), 'ab')).toBe('Must be exactly 1 character')
    expect(messageOf(z.array(z.string()).min(1), [])).toBe('Must contain at least 1 item')
    expect(messageOf(z.array(z.string()).max(1), ['a', 'b'])).toBe('Must contain at most 1 item')
  })

  it('interpolates the limit of a number, inclusive and exclusive', () => {
    expect(messageOf(z.number().min(5), 1)).toBe('Value must be at least 5')
    expect(messageOf(z.number().max(5), 10)).toBe('Value must be at most 5')
    expect(messageOf(z.number().gt(5), 5)).toBe('Value must be greater than 5')
    expect(messageOf(z.number().lt(5), 5)).toBe('Value must be less than 5')
    expect(messageOf(z.number().positive(), 0)).toBe('Must be a positive number')
    expect(messageOf(z.number().multipleOf(5), 3)).toBe('Must be a multiple of 5')
    expect(messageOf(z.bigint().min(5n), 1n)).toBe('Value must be at least 5')
  })

  it('interpolates the limit of a list', () => {
    expect(messageOf(z.array(z.string()).min(2), ['a'])).toBe('Must contain at least 2 items')
    expect(messageOf(z.array(z.string()).max(2), ['a', 'b', 'c'])).toBe(
      'Must contain at most 2 items',
    )
    expect(messageOf(z.array(z.string()).length(2), ['a'])).toBe('Must contain exactly 2 items')
  })

  it('formats the limit of a date for the reader', () => {
    const limit = new Date('2026-01-31T00:00:00Z')
    const early = messageOf(z.date().min(limit), new Date('2025-01-01T00:00:00Z'))
    const late = messageOf(z.date().max(limit), new Date('2027-01-01T00:00:00Z'))

    expect(early).toMatch(/^Must be on or after .*2026/)
    expect(late).toMatch(/^Must be on or before .*2026/)
    expect(messageOf(z.date(), 'not a date')).toBe('Please enter a valid date')
  })

  it('names the type a value should have had', () => {
    expect(messageOf(z.number(), 'abc')).toBe('Must be a number')
    expect(messageOf(z.number().int(), 1.5)).toBe('Must be an integer')
    expect(messageOf(z.int(), 1.5)).toBe('Must be an integer')
    expect(messageOf(z.boolean(), 'yes')).toBe('Please enter a valid value')
  })

  it('names the format a text should have had', () => {
    expect(messageOf(z.email(), 'nope')).toBe('Please enter a valid email address')
    expect(messageOf(z.string().email(), 'nope')).toBe('Please enter a valid email address')
    expect(messageOf(z.url(), 'nope')).toBe('Please enter a valid URL')
    expect(messageOf(z.uuid(), 'nope')).toBe('Must be a valid UUID')
    expect(messageOf(z.string().regex(/^a+$/), 'b')).toBe('Invalid format')
    expect(messageOf(z.string().startsWith('INV-'), 'x')).toBe('Must start with "INV-"')
    expect(messageOf(z.string().endsWith('.pdf'), 'x')).toBe('Must end with ".pdf"')
    expect(messageOf(z.string().includes('@'), 'x')).toBe('Must include "@"')
  })

  it('tells a value that is not on the list from one that was never chosen', () => {
    expect(messageOf(z.enum(['draft', 'active']), 'deleted')).toBe('Please select a valid option')
    expect(messageOf(z.literal(true), false)).toBe('Please select a valid option')
  })

  it('answers a refinement that carries no message of its own', () => {
    expect(
      messageOf(
        z.string().refine((value) => value === 'x'),
        'y',
      ),
    ).toBe('Invalid value')
    expect(messageOf(z.union([z.string(), z.number()]), true)).toBe('Invalid value')
  })

  it('leaves an issue nobody filling in a form can act on to zod', () => {
    const [message] = messagesOf(z.strictObject({ a: z.string() }), { a: 'x', b: 1 })
    expect(message).toContain('"b"')
  })
})

describe('a message the schema sets itself', () => {
  it('is kept, whichever way it was set', () => {
    expect(messageOf(z.string().min(2, 'Name is too short'), 'a')).toBe('Name is too short')
    expect(messageOf(z.string({ error: 'Tell us your name' }), undefined)).toBe('Tell us your name')
    expect(messageOf(z.email({ error: () => 'Not an address' }), 'x')).toBe('Not an address')
    expect(
      messageOf(
        z.string().refine((value) => value === 'x', 'Must be x'),
        'y',
      ),
    ).toBe('Must be x')
    expect(messageOf(z.literal(true, { message: 'You must agree' }), false)).toBe('You must agree')
  })

  it('wins over the map for that check only', () => {
    const schema = z.object({
      name: z.string().min(2, 'Name is too short'),
      email: z.email(),
    })
    expect(messagesOf(schema, { name: 'a', email: 'x' })).toEqual([
      'Name is too short',
      'Please enter a valid email address',
    ])
  })
})

describe('in French', () => {
  beforeEach(() => setLocale('fr'))

  it('translates the common issues with their limits', () => {
    expect(messageOf(z.string(), undefined)).toBe('Ce champ est requis')
    expect(messageOf(z.email(), 'nope')).toBe(entry('fr', 'email'))
    expect(messageOf(z.string().min(3), 'ab')).toBe('Doit contenir au moins 3 caractères')
    expect(messageOf(z.number().max(5), 10)).toBe(entry('fr', 'max', { max: 5 }))
    expect(messageOf(z.array(z.string()).min(2), [])).toBe('Doit contenir au moins 2 éléments')
    expect(messageOf(z.enum(['a', 'b']), 'c')).toBe(entry('fr', 'invalid_option'))
  })

  it('uses the singular for one, and for none', () => {
    expect(messageOf(z.string().max(1), 'ab')).toBe('Doit contenir au plus 1 caractère')
    expect(messageOf(z.array(z.string()).min(1), [])).toBe('Doit contenir au moins 1 élément')
    expect(messageOf(z.array(z.string()).max(0), ['a'])).toBe('Doit contenir au plus 0 élément')
  })

  it('formats a date limit the French way', () => {
    const message = messageOf(
      z.date().min(new Date('2026-01-31T00:00:00Z')),
      new Date('2025-01-01T00:00:00Z'),
    )
    expect(message).toContain('janv. 2026')
  })
})

describe('in Arabic', () => {
  beforeEach(() => setLocale('ar'))

  it('translates the common issues with their limits', () => {
    const required = messageOf(z.string(), undefined)
    expect(required).toBe(entry('ar', 'required', { field: entry('ar', 'field') }))
    expect(required).not.toBe(entry('en', 'required', { field: entry('en', 'field') }))
    expect(messageOf(z.email(), 'nope')).toBe(entry('ar', 'email'))
    expect(messageOf(z.number().min(5), 1)).toBe(entry('ar', 'min', { min: 5 }))
    expect(messageOf(z.number().min(5), 1)).toContain('5')
    expect(messageOf(z.enum(['a', 'b']), 'c')).toBe(entry('ar', 'invalid_option'))
  })

  it('has its own form for none, for one and for many', () => {
    const none = messageOf(z.array(z.string()).max(0), ['a'])
    const one = messageOf(z.array(z.string()).max(1), ['a', 'b'])
    const many = messageOf(z.array(z.string()).max(5), ['a', 'b', 'c', 'd', 'e', 'f'])

    expect(none).toBe(entry('ar', 'array_max', { max: 0 }, 0))
    expect(one).toBe(entry('ar', 'array_max', { max: 1 }, 1))
    expect(many).toBe(entry('ar', 'array_max', { max: 5 }, 5))
    expect(new Set([none, one, many]).size).toBe(3)
    // Only the form for many spells the number out as a digit.
    expect(many).toContain('5')
    expect(one).not.toContain('1')
    // No form leaks the separator or a neighbouring form.
    for (const message of [none, one, many]) expect(message).not.toContain('|')
  })

  it('interpolates the limit into the plural form', () => {
    const message = messageOf(z.string().min(12), 'short')

    expect(message).toBe(entry('ar', 'string_min', { min: 12 }, 12))
    expect(message).toContain('12')
    expect(message).not.toContain('{')
  })
})

describe('switching language', () => {
  it('changes the next validation, with nothing reinstalled', () => {
    const schema = z.object({ name: z.string().min(3), email: z.email() })
    const invalid = { name: 'ab', email: 'x' }

    expect(messagesOf(schema, invalid)).toEqual([
      'Must be at least 3 characters',
      'Please enter a valid email address',
    ])

    setLocale('fr')
    expect(messagesOf(schema, invalid)).toEqual([
      'Doit contenir au moins 3 caractères',
      entry('fr', 'email'),
    ])

    setLocale('ar')
    expect(messagesOf(schema, invalid)).toEqual([
      entry('ar', 'string_min', { min: 3 }, 3),
      entry('ar', 'email'),
    ])
    expect(new Set([entry('en', 'email'), entry('fr', 'email'), entry('ar', 'email')]).size).toBe(3)

    setLocale('en')
    expect(messagesOf(schema, invalid)[1]).toBe('Please enter a valid email address')
  })
})

describe('createZodErrorMap', () => {
  const echo: ValidationTranslate = (key, named, plural) =>
    `!${key}${named ? ` ${JSON.stringify(named)}` : ''}${plural === undefined ? '' : ` #${plural}`}`

  it('asks for the key that answers each issue, with the limit and the count', () => {
    uninstall()
    const off = installZodErrorMap(echo)

    expect(messageOf(z.string().min(3), 'ab')).toBe('!validation.string_min {"min":3} #3')
    expect(messageOf(z.array(z.string()).max(1), ['a', 'b'])).toBe(
      '!validation.array_max {"max":1} #1',
    )
    expect(messageOf(z.number().gt(2), 1)).toBe('!validation.greater_than {"min":2}')
    expect(messageOf(z.bigint().max(5n), 9n)).toBe('!validation.max {"max":"5"}')
    // The ISO date is the default: unambiguous in every locale.
    expect(messageOf(z.date().min(new Date('2026-01-31T00:00:00Z')), new Date(0))).toBe(
      '!validation.date_min {"min":"2026-01-31"}',
    )

    off()
  })

  it('leaves an issue to zod when the catalog has no entry for it', () => {
    // A translate function answers with the key itself when it has no entry.
    const map = createZodErrorMap((key) => key)
    const issue = { code: 'too_small', origin: 'string', minimum: 3, input: 'ab', path: [] }

    expect(map(issue as never)).toBeUndefined()
  })

  it('is what createI18nMessages produces, so the two cannot disagree', () => {
    const messages = createI18nMessages(echo)
    const map = createZodErrorMap(echo)

    expect(map({ code: 'invalid_format', format: 'email', input: 'x', path: [] } as never)).toBe(
      messages.email(),
    )
    expect(
      map({ code: 'too_big', origin: 'string', maximum: 4, input: 'abcde', path: [] } as never),
    ).toBe(messages.stringMax(4))
  })
})

describe('installZodErrorMap', () => {
  it('is undone by the function it returns', () => {
    uninstall()
    expect(messageOf(z.string().min(3), 'ab')).toContain('Too small')

    const off = installZodErrorMap(i18n.global.t as ValidationTranslate)
    expect(messageOf(z.string().min(3), 'ab')).toBe('Must be at least 3 characters')

    off()
    expect(messageOf(z.string().min(3), 'ab')).toContain('Too small')
  })

  it('replaces an earlier installation instead of stacking on it', () => {
    const first = z.config().customError
    installValidationMessages()
    const second = z.config().customError

    expect(second).not.toBe(first)
    expect(messageOf(z.string().min(3), 'ab')).toBe('Must be at least 3 characters')
  })

  it('gives a customError the project installed first the first say', () => {
    uninstall()
    z.config({
      customError: (issue) => (issue.code === 'too_small' ? 'project says: too short' : undefined),
    })
    const off = installZodErrorMap(i18n.global.t as ValidationTranslate)

    expect(messageOf(z.string().min(3), 'ab')).toBe('project says: too short')
    expect(messageOf(z.email(), 'x')).toBe('Please enter a valid email address')

    off()
    expect(messageOf(z.string().min(3), 'ab')).toBe('project says: too short')
  })
})
