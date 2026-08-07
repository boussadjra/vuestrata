/**
 * Breadcrumb trail derived from the URL.
 *
 * Routes are registered flat (`/dashboard/orders/:id` is not a *child* record of
 * `/dashboard/orders`), so `route.matched` contains the layout and the leaf and
 * nothing in between — it cannot produce a trail. The path can: each `/`-
 * delimited prefix is resolved against the router, and prefixes that correspond
 * to a real route become links.
 */
import type { InjectionKey, Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useModuleStore } from '~/modules'
import type { ModuleNavItem } from '~/modules/types'
import type { BreadcrumbItem } from '~/types'

/**
 * Lets a page replace the trailing crumb's label.
 *
 * A detail route's own metadata can only ever say "Order" — the trail should
 * read "Orders → ORD-1042", and the identifier is not known until the data
 * loads. Provided by the dashboard layout, written by the page, read by the
 * breadcrumb.
 */
export const BREADCRUMB_OVERRIDE_KEY: InjectionKey<Ref<string | null>> = Symbol(
  'vuestrata:breadcrumb-override',
)

/** Called once by the layout that renders the breadcrumb. */
export function provideBreadcrumbOverride(): Ref<string | null> {
  const override = ref<string | null>(null)
  provide(BREADCRUMB_OVERRIDE_KEY, override)
  return override
}

/**
 * Set the trailing crumb from a page. Accepts a getter so the label can follow
 * an async query result, and clears itself on unmount so a stale entity name
 * never leaks onto the next page.
 */
export function useBreadcrumbLabel(source: () => string | null | undefined): void {
  const override = inject(BREADCRUMB_OVERRIDE_KEY, null)
  if (!override) return
  watchEffect(() => {
    override.value = source() ?? null
  })
  onScopeDispose(() => {
    override.value = null
  })
}

/** Depth-first search of the nav tree for an entry pointing at `path`. */
function findNavLabel(items: readonly ModuleNavItem[], path: string): string | undefined {
  for (const item of items) {
    if (item.to === path) return item.label
    const nested = item.children ? findNavLabel(item.children, path) : undefined
    if (nested) return nested
  }
  return undefined
}

export function useBreadcrumbs() {
  const route = useRoute()
  const router = useRouter()
  // `te` is destructured through a wrapper rather than directly: vue-i18n
  // declares it as a method, so pulling it off the composer trips
  // `unbound-method`, and it genuinely does read `this`.
  const i18n = useI18n()
  const { t } = i18n
  const te = (key: string) => i18n.te(key)
  const moduleStore = useModuleStore()
  const override = inject(BREADCRUMB_OVERRIDE_KEY, null)

  /**
   * Resolve a path prefix to a display label.
   *
   * `meta.title` first (explicit and owned by the route), then the sidebar
   * label for the same target (already translated, and keeps the two in step),
   * then a humanized segment. The last one exists so a route someone forgot to
   * label still reads as words rather than vanishing from the trail.
   */
  function labelFor(path: string, segment: string): string | null {
    const resolved = router.resolve(path)
    const isRealRoute = resolved.matched.length > 0

    const titleKey = resolved.meta.title
    if (typeof titleKey === 'string' && te(titleKey)) return t(titleKey)

    const navKey = findNavLabel(moduleStore.navItems, path)
    if (navKey && te(navKey)) return t(navKey)

    // A path segment that resolves to nothing and has no label is a URL
    // fragment, not a page — dropping it beats inventing a name for it.
    if (!isRealRoute) return null

    return humanize(segment)
  }

  const items = computed<BreadcrumbItem[]>(() => {
    const segments = route.path.split('/').filter(Boolean)
    const crumbs: BreadcrumbItem[] = []

    let prefix = ''
    for (const [index, segment] of segments.entries()) {
      prefix += `/${segment}`
      const isLast = index === segments.length - 1

      const label = isLast && override?.value ? override.value : labelFor(prefix, segment)
      if (!label) continue

      crumbs.push({ label, to: isLast ? undefined : prefix })
    }

    return crumbs
  })

  return { items }
}

function humanize(segment: string): string {
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
