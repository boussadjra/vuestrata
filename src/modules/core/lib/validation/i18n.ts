/**
 * Turns a `validation.*` key into its text.
 *
 * vue-i18n's `t` is one. The third argument is the count a message with
 * singular and plural forms is chosen by (`'… {min} character | … {min}
 * characters'`); a translate function that ignores it still works, and shows
 * the first form.
 */
export type ValidationTranslate = (
  key: string,
  named?: Record<string, string | number>,
  plural?: number,
) => string

/** The count a plural form is chosen by. A limit too large for a number is "many". */
function pluralCount(limit: number | bigint): number {
  return typeof limit === 'bigint' ? Number.MAX_SAFE_INTEGER : limit
}

/** A limit as it is shown: a bigint cannot be a vue-i18n named value. */
function shown(limit: number | bigint): string | number {
  return typeof limit === 'bigint' ? limit.toString() : limit
}

/**
 * Creates localized validation messages using the provided translation function.
 * Use with Vue I18n: `createI18nMessages(t)` where `t` is `useI18n().t`
 *
 * `createZodErrorMap` (`./zod-error-map`) is built on these, which is how a
 * zod schema with no messages of its own reads in the user's language. Call
 * them directly for a message a schema sets itself:
 * `z.string().refine(isFree, { error: () => messages.pattern() })`.
 */
export function createI18nMessages(t: ValidationTranslate) {
  return {
    required: (field?: string) =>
      t('validation.required', { field: field ?? t('validation.field') }),
    email: () => t('validation.email'),
    min: (min: number | bigint) => t('validation.min', { min: shown(min) }),
    max: (max: number | bigint) => t('validation.max', { max: shown(max) }),
    minLength: (min: number) => t('validation.min_length', { min }),
    maxLength: (max: number) => t('validation.max_length', { max }),
    pattern: () => t('validation.pattern'),
    url: () => t('validation.url'),
    numeric: () => t('validation.numeric'),
    integer: () => t('validation.integer'),
    positive: () => t('validation.positive'),
    confirmed: (field?: string) =>
      t('validation.confirmed', { field: field ?? t('validation.field') }),

    // The members below choose a singular or plural form by the limit, which
    // `minLength` and `maxLength` above never did: their catalog entries are
    // one fixed sentence, and stay that way for the projects that translate
    // those keys themselves.
    stringMin: (min: number | bigint) =>
      t('validation.string_min', { min: shown(min) }, pluralCount(min)),
    stringMax: (max: number | bigint) =>
      t('validation.string_max', { max: shown(max) }, pluralCount(max)),
    stringLength: (length: number | bigint) =>
      t('validation.string_length', { length: shown(length) }, pluralCount(length)),
    arrayMin: (min: number | bigint) =>
      t('validation.array_min', { min: shown(min) }, pluralCount(min)),
    arrayMax: (max: number | bigint) =>
      t('validation.array_max', { max: shown(max) }, pluralCount(max)),
    arrayLength: (length: number | bigint) =>
      t('validation.array_length', { length: shown(length) }, pluralCount(length)),
    greaterThan: (min: number | bigint) => t('validation.greater_than', { min: shown(min) }),
    lessThan: (max: number | bigint) => t('validation.less_than', { max: shown(max) }),
    multipleOf: (divisor: number | bigint) =>
      t('validation.multiple_of', { divisor: shown(divisor) }),
    date: () => t('validation.date'),
    dateMin: (min: string) => t('validation.date_min', { min }),
    dateMax: (max: string) => t('validation.date_max', { max }),
    uuid: () => t('validation.uuid'),
    startsWith: (prefix: string) => t('validation.starts_with', { prefix }),
    endsWith: (suffix: string) => t('validation.ends_with', { suffix }),
    includes: (text: string) => t('validation.includes', { text }),
    invalidOption: () => t('validation.invalid_option'),
    invalidType: () => t('validation.invalid_type'),
    invalid: () => t('validation.invalid'),
  }
}

export type I18nValidationMessages = ReturnType<typeof createI18nMessages>
