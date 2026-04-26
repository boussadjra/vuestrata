/**
 * Loads and merges module translations into the global i18n instance.
 */
import { getI18n } from '~/plugins/i18n'

import type { ModuleDefinition } from './types'

/**
 * Merge shared + per-module translations into the vue-i18n instance.
 * Call after modules are registered and before the app mounts.
 */
export function loadModuleTranslations(modules: ModuleDefinition[]): void {
  let i18n: ReturnType<typeof getI18n> | null = null
  for (const mod of modules) {
    if (!mod.i18n) continue
    i18n ??= getI18n()
    for (const [locale, messages] of Object.entries(mod.i18n)) {
      i18n.global.mergeLocaleMessage(locale, messages)
    }
  }
}
