import { useI18n } from 'vue-i18n'

export function permissionI18nKey(perm: string): string {
  return `perm_${perm.replaceAll(':', '_')}`
}

export function permissionNamespaceI18nKey(ns: string): string {
  return `perm_ns_${ns}`
}

export function permissionAction(perm: string): string {
  return perm.includes(':') ? perm.slice(perm.indexOf(':') + 1) : perm
}

export function permissionActionI18nKey(perm: string): string {
  return `perm_action_${permissionAction(perm)}`
}

/**
 * Stable order for verbs in a compact grants list: read → write → admin-ish.
 * Unknown actions sort after the known set, then alphabetically by label.
 */
const ACTION_ORDER = ['read', 'create', 'update', 'delete', 'manage', 'assign', 'export']

export function permissionActionRank(perm: string): number {
  const index = ACTION_ORDER.indexOf(permissionAction(perm))
  return index === -1 ? ACTION_ORDER.length : index
}

export function humanizePermission(perm: string): string {
  return perm
    .split(':')
    .map((part) => part.replaceAll('_', ' '))
    .join(' ')
}

/**
 * Human-readable permission and namespace labels.
 *
 * Catalog keys are `perm_users_read` / `perm_ns_users`. When a key is missing
 * (a newly registered permission, or a locale that has not caught up), the
 * raw `users:read` token is split into words instead of showing the key.
 */
export function usePermissionLabels() {
  const { t, locale } = useI18n()

  function permLabel(perm: string): string {
    const key = permissionI18nKey(perm)
    const translated = t(key)
    return translated !== key ? translated : humanizePermission(perm)
  }

  function permNamespaceLabel(ns: string): string {
    const key = permissionNamespaceI18nKey(ns)
    const translated = t(key)
    return translated !== key ? translated : ns
  }

  /**
   * Verb only (`View`, `Create`) for a compact namespace × action list.
   * The full `permLabel` still names the control for assistive tech.
   */
  function permActionLabel(perm: string): string {
    const key = permissionActionI18nKey(perm)
    const translated = t(key)
    if (translated !== key) return translated
    const action = permissionAction(perm).replaceAll('_', ' ')
    return action.replace(/\b\w/g, (char) => char.toUpperCase())
  }

  function compareLabels(a: string, b: string): number {
    return a.localeCompare(b, locale.value)
  }

  return { permLabel, permActionLabel, permNamespaceLabel, compareLabels }
}
