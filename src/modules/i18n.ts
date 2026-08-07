/**
 * Loads and merges module translations into the global i18n instance.
 */
import { createScopedLogger } from '~/lib/logger'
import { getI18n } from '~/plugins/i18n'

import type { ModuleDefinition } from './types'

const i18nLogger = createScopedLogger('modules:i18n')

/**
 * Merge shared + per-module translations into the vue-i18n instance.
 * Call after modules are registered and before the app mounts.
 *
 * Merging is last-write-wins by design (vue-i18n's `mergeLocaleMessage`), which
 * means two modules claiming the same key silently produce whichever loaded
 * second — and with eight domain modules all reaching for names like
 * `common_status` or `nav_orders`, that is a matter of when, not if. The
 * collision report below does not change the merge; it makes the collision
 * *visible* at boot instead of surfacing as a mistranslated label nobody can
 * trace back to its owner.
 *
 * Reported in dev only. In production the app should render, not lecture, and
 * the report costs a full key-by-key scan of every locale.
 */
export function loadModuleTranslations(modules: ModuleDefinition[]): void {
  let i18n: ReturnType<typeof getI18n> | null = null

  /** locale → key → module ids that defined it */
  const owners = new Map<string, Map<string, string[]>>()

  for (const mod of modules) {
    if (!mod.i18n) continue
    i18n ??= getI18n()

    for (const [locale, messages] of Object.entries(mod.i18n)) {
      if (import.meta.env.DEV) {
        let localeOwners = owners.get(locale)
        if (!localeOwners) {
          localeOwners = new Map()
          owners.set(locale, localeOwners)
        }
        for (const key of Object.keys(messages)) {
          const existing = localeOwners.get(key)
          if (existing) existing.push(mod.config.id)
          else localeOwners.set(key, [mod.config.id])
        }
      }

      i18n.global.mergeLocaleMessage(locale, messages)
    }
  }

  if (import.meta.env.DEV) reportCollisions(owners)
}

function reportCollisions(owners: Map<string, Map<string, string[]>>): void {
  for (const [locale, keys] of owners) {
    const collisions: string[] = []
    for (const [key, ids] of keys) {
      if (ids.length > 1) collisions.push(`${key} (${ids.join(' → ')}, "${ids.at(-1)}" wins)`)
    }
    if (collisions.length > 0) {
      i18nLogger.warn(
        `${collisions.length} translation key collision(s) in locale "${locale}":\n  ${collisions.join('\n  ')}`,
      )
    }
  }
}
