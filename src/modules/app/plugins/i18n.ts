import { effectScope, type App } from 'vue'
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

export function getI18n() {
  return i18n
}

/**
 * Install vue-i18n on the app and bind the active locale to the app store.
 *
 * The locale watcher is owned by an `effectScope` tied to `app.unmount` so
 * that test setups which mount/unmount repeatedly do not leak watchers
 * across instances.
 */
export function installI18n(app: App) {
  const appStore = useAppStore()

  const scope = effectScope()
  scope.run(() => {
    watch(
      () => appStore.locale,
      (locale) => {
        i18n.global.locale.value = toSupportedLocale(locale)
      },
      { immediate: true },
    )
  })

  const originalUnmount = app.unmount.bind(app)
  app.unmount = () => {
    scope.stop()
    originalUnmount()
  }

  app.use(i18n)
  return i18n
}
