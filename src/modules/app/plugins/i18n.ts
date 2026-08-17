import { storeToRefs } from 'pinia'
import { type App, watch } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAppStore } from '@/stores/app'

import ar from '../locales/ar.json'
import en from '../locales/en.json'
import fr from '../locales/fr.json'
// `appearance.ts` owns the locale list — it also holds LOCALE_METADATA and
// RTL_LOCALES, so adding a language stays a single-file change. This module
// used to re-declare the same tuple, which meant a fourth locale could be
// half-added and still typecheck.
import { resolveActiveLocale, SUPPORTED_LOCALES, type SupportedLocale } from './appearance'

function toSupportedLocale(locale: string): SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale) ? (locale as SupportedLocale) : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, fr, ar },
})

/**
 * `import.meta.hot.accept` types its callback argument as `ModuleNamespace`,
 * which has no declared overlap with the locale JSON shape — hence the
 * structural check plus cast rather than a typed parameter.
 */
function hotMergeLocale(locale: SupportedLocale, mod: unknown) {
  const next = (mod as { default?: typeof en } | undefined)?.default
  if (next) i18n.global.mergeLocaleMessage(locale, next)
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

function readPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}

/**
 * Install vue-i18n on the app and bind the active locale to the app store.
 *
 * Documentation routes force English via `resolveActiveLocale`. The store
 * (and localStorage) keep the user's preference; this only chooses what
 * vue-i18n renders. SPA navigations are handled by `useLocaleSync`, which
 * watches the router — this watcher only re-runs when the stored locale
 * changes, and then reads `window.location.pathname` so a docs tab still
 * stays English if Settings is mutated from another tab.
 */
export function installI18n(app: App) {
  const { locale } = storeToRefs(useAppStore())

  watch(
    locale,
    (value) => {
      i18n.global.locale.value = resolveActiveLocale(readPathname(), toSupportedLocale(value))
    },
    { immediate: true },
  )

  app.use(i18n)
  return i18n
}
