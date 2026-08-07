/**
 * Read a route parameter from a dynamically-registered route.
 *
 * `unplugin-vue-router` generates a typed route map from the files in
 * `src/pages`, but module routes are added at runtime by `setupModules` — they
 * are not in that map, so `route.params.id` does not type-check on a page the
 * router only learns about at boot.
 *
 * The cast lives here, once, with the reason attached, rather than being
 * scattered across every detail page as an inline `as` that reads like
 * carelessness. The value is still validated: params are always strings or
 * arrays of strings at runtime, and this narrows to the single-string case.
 */
export function useRouteParam(name: string): ComputedRef<string | undefined> {
  const route = useRoute()

  return computed(() => {
    const params = route.params as Record<string, string | string[] | undefined>
    const value = params[name]
    // A repeated param (`/a/:id+`) arrives as an array. Taking the first entry
    // beats `String(value)`, which would produce "1,2" and then 404.
    const single = Array.isArray(value) ? value[0] : value
    return single && single.length > 0 ? single : undefined
  })
}
