/**
 * Audit-log rules and presentation.
 *
 * Plain functions over an array of entries — no Vue, no query client, no route.
 * These lived in the audit page, where "does this entry match the search box"
 * could only be exercised by mounting a component and typing into it.
 */
import type { AuditLogEntry, IconName } from '~/types'

/**
 * Tone applied to an action badge.
 *
 * Actions are grouped into a handful of tones rather than each picking its own
 * colour. An earlier map mixed raw palette families (blue, cyan, yellow, red)
 * with theme families (primary, secondary) in the same object, so half the
 * badges followed the active theme and half did not.
 */
export const AUDIT_ACTION_TONES = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info-100 text-info-800 dark:bg-info-900/30 dark:text-info-200',
  success: 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-200',
  warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-200',
  danger: 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-200',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  secondary: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-300',
} as const

export type AuditActionTone = keyof typeof AUDIT_ACTION_TONES

const ACTION_TONE: Record<string, AuditActionTone> = {
  'user.login': 'info',
  'user.logout': 'neutral',
  'user.register': 'success',
  'user.invite': 'success',
  'user.update_role': 'info',
  'role.update': 'info',
  'report.create': 'secondary',
  'report.export': 'secondary',
  'billing.subscribe': 'primary',
  'billing.update_plan': 'primary',
  'billing.cancel': 'danger',
  'settings.update': 'warning',
}

const ACTION_ICON: Record<string, IconName> = {
  'user.login': 'login',
  'user.logout': 'logout',
  'user.register': 'user-plus',
  'user.invite': 'user-plus',
  'user.update_role': 'shield-user',
  'role.update': 'shield-user',
  'report.create': 'document',
  'report.export': 'download',
  'billing.subscribe': 'card',
  'billing.update_plan': 'card',
  'billing.cancel': 'close-circle',
  'settings.update': 'settings',
}

/** An action the map does not know about still gets a readable badge. */
export function auditActionToneClass(action: string): string {
  return AUDIT_ACTION_TONES[ACTION_TONE[action] ?? 'neutral']
}

export function auditActionIcon(action: string): IconName {
  return ACTION_ICON[action] ?? 'document'
}

/** `user.update_role` → `audit_action_user_update_role`. */
export function auditActionTranslationKey(action: string): string {
  return `audit_action_${action.replaceAll('.', '_')}`
}

/**
 * Fallback label for an action with no translation.
 *
 * `billing.update_plan` → "Billing Update Plan". Better than showing the raw
 * key, and it means adding a new server-side action does not blank the filter
 * chips until someone writes three locale entries.
 */
export function humanizeAuditAction(action: string): string {
  return action.replace(/[._]+/g, ' ').replace(/\b\w/g, (segment) => segment.toUpperCase())
}

/** Distinct actions present in a page of entries, in first-seen order. */
export function uniqueAuditActions(entries: readonly AuditLogEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.action))]
}

/**
 * Does an entry match a free-text query?
 *
 * Case-insensitive across the four fields a reader can actually see, plus the
 * serialized details blob — someone searching for a request id finds it there
 * and nowhere else.
 */
export function matchesAuditSearch(entry: AuditLogEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  return (
    entry.action.toLowerCase().includes(needle) ||
    entry.userId.toLowerCase().includes(needle) ||
    entry.resource.toLowerCase().includes(needle) ||
    (entry.details !== undefined && JSON.stringify(entry.details).toLowerCase().includes(needle))
  )
}

/**
 * Narrow a page of entries by the search box.
 *
 * Client-side on purpose, and only within the page the server already sent:
 * the action filter is a query parameter, this is a refinement of what is
 * on screen.
 */
export function filterAuditEntries(
  entries: readonly AuditLogEntry[],
  query: string,
): AuditLogEntry[] {
  if (!query.trim()) return [...entries]
  return entries.filter((entry) => matchesAuditSearch(entry, query))
}

/** How many entries on this page belong to a domain (`user.`, `billing.`, …). */
export function countAuditActionsByPrefix(
  entries: readonly AuditLogEntry[],
  prefix: string,
): number {
  return entries.filter((entry) => entry.action.startsWith(prefix)).length
}
