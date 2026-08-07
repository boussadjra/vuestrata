/**
 * Sidebar section registry.
 *
 * Modules reference a group by id (`ModuleNavItem.group`); the heading text and
 * its position live here, once. Modules deliberately cannot *define* groups —
 * if they could, two modules contributing to the same section would each carry
 * their own copy of the label and could disagree about its order, and the
 * sidebar would grow a new heading every time someone typed a slightly
 * different string.
 *
 * Adding a section is a deliberate act: add an entry here, add its `label` key
 * to every locale file, then point module nav items at the id.
 */
import type { ModuleNavGroupDefinition } from './types'

export const NAV_GROUPS: readonly ModuleNavGroupDefinition[] = [
  { id: 'overview', label: 'nav_group_overview', order: 10 },
  { id: 'commerce', label: 'nav_group_commerce', order: 20 },
  { id: 'work', label: 'nav_group_work', order: 30 },
  { id: 'organization', label: 'nav_group_organization', order: 40 },
  { id: 'account', label: 'nav_group_account', order: 50 },
  { id: 'reference', label: 'nav_group_reference', order: 60 },
] as const

/** Group used by nav items that do not declare one. */
export const DEFAULT_NAV_GROUP = 'overview'

const GROUPS_BY_ID = new Map(NAV_GROUPS.map((group) => [group.id, group]))

/**
 * Resolve a group id to its definition.
 *
 * Falls back to the default group rather than dropping the item: an unknown id
 * is a typo in a module barrel, and silently hiding a navigation entry is a far
 * worse failure mode than showing it under the wrong heading.
 */
export function resolveNavGroup(id: string | undefined): ModuleNavGroupDefinition {
  return GROUPS_BY_ID.get(id ?? DEFAULT_NAV_GROUP) ?? GROUPS_BY_ID.get(DEFAULT_NAV_GROUP)!
}

export function isKnownNavGroup(id: string): boolean {
  return GROUPS_BY_ID.has(id)
}
