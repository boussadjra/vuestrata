import { getI18n } from '@/plugins/i18n'

import analyticsAr from '../i18n/ar.json'
import analyticsEn from '../i18n/en.json'
import analyticsFr from '../i18n/fr.json'

/**
 * Dashboard copy must go through the global catalog, not a component-local
 * `t()`. `@intlify/unplugin-vue-i18n` can compile an SFC against a partial
 * message map; keys then resolve to the key itself on the live board.
 */
let dashboardMessagesMerged = false

export function ensureDashboardMessages(): void {
  if (dashboardMessagesMerged) return
  dashboardMessagesMerged = true
  const i18n = getI18n()
  i18n.global.mergeLocaleMessage('en', analyticsEn)
  i18n.global.mergeLocaleMessage('fr', analyticsFr)
  i18n.global.mergeLocaleMessage('ar', analyticsAr)
}

export function dashboardT(key: string, params?: Record<string, unknown>): string {
  ensureDashboardMessages()
  const i18n = getI18n()
  if (params) return String(i18n.global.t(key, params))
  return String(i18n.global.t(key))
}

if (import.meta.hot) {
  import.meta.hot.accept(['../i18n/en.json', '../i18n/fr.json', '../i18n/ar.json'], () => {
    dashboardMessagesMerged = false
    ensureDashboardMessages()
  })
}

export function useDashboardI18n() {
  ensureDashboardMessages()
  const i18n = getI18n()

  function dt(key: string): string
  function dt(key: string, params: Record<string, unknown>): string
  function dt(key: string, params?: Record<string, unknown>): string {
    if (params) return String(i18n.global.t(key, params))
    return String(i18n.global.t(key))
  }

  return { dt, locale: i18n.global.locale }
}
