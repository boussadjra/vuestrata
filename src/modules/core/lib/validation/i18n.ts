/**
 * Creates localized validation messages using the provided translation function.
 * Use with Vue I18n: `createI18nMessages(t)` where `t` is `useI18n().t`
 */
export function createI18nMessages(
  t: (key: string, named?: Record<string, string | number>) => string,
) {
  return {
    required: (field?: string) =>
      t('validation.required', { field: field ?? t('validation.field') }),
    email: () => t('validation.email'),
    min: (min: number) => t('validation.min', { min }),
    max: (max: number) => t('validation.max', { max }),
    minLength: (min: number) => t('validation.min_length', { min }),
    maxLength: (max: number) => t('validation.max_length', { max }),
    pattern: () => t('validation.pattern'),
    url: () => t('validation.url'),
    numeric: () => t('validation.numeric'),
    integer: () => t('validation.integer'),
    positive: () => t('validation.positive'),
    confirmed: (field?: string) =>
      t('validation.confirmed', { field: field ?? t('validation.field') }),
  }
}
