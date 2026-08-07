/**
 * The locale switcher's model.
 *
 * The list of languages and the read/write plumbing were previously repeated in
 * the header and the settings page, each with its own normalization rules — so
 * a value the header accepted could be one the settings page rejected. One
 * composable, one normalizer.
 */
import {
  LOCALE_METADATA,
  SUPPORTED_LOCALES,
  isRtlLocale,
  type SupportedLocale,
} from '~/plugins/appearance'
import { useAppStore } from '~/stores/app'

export interface LocaleOption {
  code: SupportedLocale
  /** Endonym — the language's own name. Never translated. */
  label: string
  flag: string
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = SUPPORTED_LOCALES.map((code) => ({
  code,
  ...LOCALE_METADATA[code],
}))

const SUPPORTED = new Set<string>(SUPPORTED_LOCALES)

/**
 * Coerce anything — a persisted value, a `navigator.language`, a query param —
 * into a locale the app can actually render.
 *
 * Falls back through the base subtag so `fr-CA` and `ar-EG` resolve to `fr` and
 * `ar` rather than silently dropping the user back to English.
 */
export function normalizeLocale(input: string | string[] | null | undefined): SupportedLocale {
  const candidate = Array.isArray(input) ? input[0] : input
  if (typeof candidate !== 'string' || candidate.length === 0) return 'en'

  const lowered = candidate.toLowerCase()
  if (SUPPORTED.has(lowered)) return lowered as SupportedLocale
  const base = lowered.split('-')[0]
  return base && SUPPORTED.has(base) ? (base as SupportedLocale) : 'en'
}

export function useLocales() {
  const appStore = useAppStore()

  const current = computed<SupportedLocale>({
    get: () => normalizeLocale(appStore.locale),
    set: (value) => {
      const normalized = normalizeLocale(value)
      if (normalized !== appStore.locale) appStore.setLocale(normalized)
    },
  })

  const isRtl = computed(() => isRtlLocale(current.value))

  return { options: LOCALE_OPTIONS, current, isRtl }
}
