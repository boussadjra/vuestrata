import { useI18n } from 'vue-i18n'

import ar from '@/locales/ar.json'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'

const catalogs = { en, fr, ar } as const

export type AppLocaleKey = keyof typeof en

/**
 * Read a shell-catalog string without going through component-scoped `t()`.
 *
 * `@intlify/unplugin-vue-i18n` only bundles keys it sees at compile time. Keys
 * added after the dev server started (or after a file was first transformed)
 * resolve to the key string until a full restart. Importing the JSON keeps the
 * copy in sync with `src/modules/app/locales/*.json` during HMR.
 */
export function useAppLocaleString(key: AppLocaleKey) {
  const { locale } = useI18n()

  return computed(() => {
    const catalog = catalogs[locale.value as keyof typeof catalogs] ?? catalogs.en
    return String(catalog[key] ?? catalogs.en[key] ?? key)
  })
}
