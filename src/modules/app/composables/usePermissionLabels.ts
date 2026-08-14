import { useI18n } from 'vue-i18n'

export function permissionI18nKey(perm: string): string {
  return `perm_${perm.replaceAll(':', '_')}`
}

export function permissionNamespaceI18nKey(ns: string): string {
  return `perm_ns_${ns}`
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

  function compareLabels(a: string, b: string): number {
    return a.localeCompare(b, locale.value)
  }

  return { permLabel, permNamespaceLabel, compareLabels }
}
