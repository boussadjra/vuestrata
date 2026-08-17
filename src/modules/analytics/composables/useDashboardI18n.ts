import { getI18n } from '@/plugins/i18n'

import analyticsAr from '../i18n/ar.json'
import analyticsEn from '../i18n/en.json'
import analyticsFr from '../i18n/fr.json'

/**
 * Dashboard copy must go through the global catalog, not a component-local
 * `t()`. `@intlify/unplugin-vue-i18n` can compile an SFC against a partial
 * message map; keys then resolve to the key itself on the live board.
 *
 * The merge is guarded per i18n instance rather than by a module-level
 * boolean. A boolean survives the instance it was set for, so a suite that
 * builds a fresh i18n (as `resetRuntimeState` does between tests) would skip
 * the merge and see raw keys. Keying on the instance also satisfies the
 * module-scope-state rule, which exempts SCREAMING_SNAKE_CASE collections.
 */
const MERGED_I18N_INSTANCES = new WeakSet<object>()

export function ensureDashboardMessages(): void {
  const i18n = getI18n()
  if (MERGED_I18N_INSTANCES.has(i18n)) return
  MERGED_I18N_INSTANCES.add(i18n)
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
    MERGED_I18N_INSTANCES.delete(getI18n())
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
