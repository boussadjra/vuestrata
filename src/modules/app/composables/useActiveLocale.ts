/**
 * The locale that is actually rendered, as opposed to the user's persisted
 * preference.
 *
 * `useLocales()` is the switcher's model — it always reads and writes the
 * stored language. This module is the render path: documentation pages lock
 * English/LTR without touching that preference, and everything that paints
 * direction or chrome (html[dir], vue-i18n, RTL-aware controls) follows it.
 */
import { hasInjectionContext, inject } from 'vue'
import { routeLocationKey } from 'vue-router'

import {
  applyAppearance,
  isRtlLocale,
  resolveActiveLocale,
  type SupportedLocale,
} from '@/plugins/appearance'
import { getI18n } from '@/plugins/i18n'
import { useAppStore } from '@/stores/app'

function readWindowPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}

/**
 * Current path, from the router when one is installed and from
 * `window.location` otherwise (pre-mount bootstrap, tests that call sync
 * helpers outside of `setup()`).
 */
export function useActivePathname() {
  const route = hasInjectionContext() ? inject(routeLocationKey, null) : null

  return computed(() => route?.path ?? readWindowPathname())
}

export function useActiveLocale() {
  const appStore = useAppStore()
  const pathname = useActivePathname()

  const current = computed<SupportedLocale>(() =>
    resolveActiveLocale(pathname.value, appStore.locale as SupportedLocale),
  )

  const isRtl = computed(() => isRtlLocale(current.value))

  return {
    current,
    isRtl,
    dir: computed<'ltr' | 'rtl'>(() => (isRtl.value ? 'rtl' : 'ltr')),
  }
}

/**
 * Keep vue-i18n and `<html lang/dir>` on the active locale. Call from the
 * app root so SPA moves into and out of `/docs` reapply without writing
 * the persisted preference.
 *
 * `useThemeSync` still writes locale onto `<html>` as part of the full
 * appearance snapshot; this watcher is what makes vue-i18n follow the
 * same override, and it re-applies `dir`/`lang` if a theme sync ran
 * without a router (tests).
 */
export function useLocaleSync() {
  const { current } = useActiveLocale()

  const stop = watchEffect(() => {
    const locale = current.value
    applyAppearance({ locale })
    getI18n().global.locale.value = locale
  })

  if (getCurrentScope()) onScopeDispose(stop)
  return stop
}
