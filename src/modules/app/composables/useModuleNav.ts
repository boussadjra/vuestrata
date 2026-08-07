/**
 * Sidebar navigation model.
 *
 * Turns the raw module contributions into something the sidebar can render
 * directly: permission-filtered, grouped, and with active state already
 * resolved. Keeping this out of the components means the two hard parts —
 * "may this user see it" and "is this the current page" — are decided once and
 * unit-testable, instead of being re-derived in every template that renders a
 * nav entry.
 */
import { useRbac } from '~/composables/useRbac'
import { useModuleStore, type ResolvedNavGroup } from '~/modules'
import type { ModuleNavItem } from '~/modules/types'

/** A nav item whose children have already been permission-filtered. */
export interface VisibleNavItem extends Omit<ModuleNavItem, 'children'> {
  children?: VisibleNavItem[]
}

export interface VisibleNavGroup extends Omit<ResolvedNavGroup, 'items'> {
  items: VisibleNavItem[]
}

/**
 * Is `path` the current location for a nav entry pointing at `to`?
 *
 * Prefix matching by default, so a section root stays active on its own detail
 * pages (`/dashboard/orders` on `/dashboard/orders/42`). The trailing slash
 * stops `/dashboard/order` from matching `/dashboard/orders`. `exact` opts an
 * index entry out, since `/dashboard` would otherwise be active everywhere.
 */
export function matchesRoute(currentPath: string, to: string | undefined, exact = false): boolean {
  if (!to) return false
  const target = to.replace(/\/+$/, '') || '/'
  const current = currentPath.replace(/\/+$/, '') || '/'
  if (current === target) return true
  if (exact || target === '/') return false
  return current.startsWith(`${target}/`)
}

/** True when the item itself, or anything beneath it, is the current page. */
export function isBranchActive(currentPath: string, item: VisibleNavItem): boolean {
  if (matchesRoute(currentPath, item.to, item.exact)) return true
  return item.children?.some((child) => isBranchActive(currentPath, child)) ?? false
}

export function useModuleNav() {
  const moduleStore = useModuleStore()
  const { can } = useRbac()
  const route = useRoute()

  /**
   * Recursively drop what the user may not see.
   *
   * A parent whose children are all filtered away and which has no route of its
   * own is dropped too — otherwise the sidebar grows disclosure buttons that
   * open onto nothing. Filtering (rather than `v-show`) also keeps unreachable
   * routes out of the accessibility tree entirely.
   */
  function filterItems(items: readonly ModuleNavItem[]): VisibleNavItem[] {
    const visible: VisibleNavItem[] = []
    for (const item of items) {
      if (item.permission && !can(item.permission)) continue
      const children = item.children ? filterItems(item.children) : undefined
      if (item.children && children!.length === 0 && !item.to) continue
      visible.push({ ...item, children: children?.length ? children : undefined })
    }
    return visible
  }

  const groups = computed<VisibleNavGroup[]>(() =>
    moduleStore.navGroups
      .map((group) => ({ ...group, items: filterItems(group.items) }))
      .filter((group) => group.items.length > 0),
  )

  const currentPath = computed(() => route.path)

  return { groups, currentPath }
}
