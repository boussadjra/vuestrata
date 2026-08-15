import { storeToRefs } from 'pinia'
import { type App, watch } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAppStore } from '@/stores/app'

import ar from '../locales/ar.json'
import en from '../locales/en.json'
import fr from '../locales/fr.json'

const supportedLocales = ['en', 'fr', 'ar'] as const
type SupportedLocale = (typeof supportedLocales)[number]

function toSupportedLocale(locale: string): SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale) ? (locale as SupportedLocale) : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, fr, ar },
})

function hotMergeLocale(locale: SupportedLocale, mod: { default?: typeof en } | undefined) {
  if (mod?.default) i18n.global.mergeLocaleMessage(locale, mod.default)
}

// Locale JSON is compiled into this singleton. Vite HMR of the JSON file does
// not recreate `i18n`, so new keys have to be merged onto the live instance
// or they render as the key itself until a full restart.
if (import.meta.hot) {
  import.meta.hot.accept('../locales/en.json', (mod) => hotMergeLocale('en', mod))
  import.meta.hot.accept('../locales/fr.json', (mod) => hotMergeLocale('fr', mod))
  import.meta.hot.accept('../locales/ar.json', (mod) => hotMergeLocale('ar', mod))
}

export function getI18n() {
  return i18n
}

/**
 * Install vue-i18n on the app and bind the active locale to the app store.
 */
export function installI18n(app: App) {
  const { locale } = storeToRefs(useAppStore())

  watch(
    locale,
    (value) => {
      i18n.global.locale.value = toSupportedLocale(value)
    },
    { immediate: true },
  )

  app.use(i18n)
  return i18n
}
