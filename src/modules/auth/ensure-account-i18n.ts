import { getI18n } from '@/plugins/i18n'

import accountEn from './i18n/en.json'

/**
 * Account copy must reach the live i18n instance, not only the boot merge.
 *
 * `@intlify/unplugin-vue-i18n` can compile an SFC against a partial catalog,
 * and Vite HMR of locale JSON does not recreate the singleton — new keys then
 * render as the key itself. Same pattern as `ensureDashboardMessages`.
 * Only the English fallback is eager; the module loader supplies other languages.
 */
const MERGED_I18N_INSTANCES = new WeakSet<object>()

export function ensureAccountMessages(): void {
  const i18n = getI18n()
  if (MERGED_I18N_INSTANCES.has(i18n)) return
  MERGED_I18N_INSTANCES.add(i18n)
  i18n.global.mergeLocaleMessage('en', accountEn)
}

if (import.meta.hot) {
  import.meta.hot.accept('./i18n/en.json', () => {
    MERGED_I18N_INSTANCES.delete(getI18n())
    ensureAccountMessages()
  })
}

export function accountT(key: string): string {
  ensureAccountMessages()
  return String(getI18n().global.t(key))
}
