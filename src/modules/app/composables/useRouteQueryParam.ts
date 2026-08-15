/**
 * Read a search parameter from the current URL as a single normalized string.
 *
 * The router-side type of a query value is `string | null | (string | null)[]`,
 * which is a shape no feature should ever see: `?thread=a&thread=b` arrives as
 * an array, `?thread` as `null`, and a missing key as `undefined`. Passing that
 * downward means every consumer re-implements the same three checks, and the
 * one that forgets renders `"a,b"`.
 *
 * This is the query-string counterpart to `useRouteParam`, and belongs to the
 * same layer: routing state is translated into an application value at the
 * route boundary, and only the normalized value travels inward.
 *
 * @example
 * const threadId = useRouteQueryParam('thread')
 * //    ^? ComputedRef<string | undefined>
 */
export function useRouteQueryParam(name: string): ComputedRef<string | undefined> {
  const route = useRoute()

  return computed(() => {
    const value = route.query[name]
    // A repeated key arrives as an array. Taking the first entry beats
    // `String(value)`, which would produce "a,b" and match no record.
    const single = Array.isArray(value) ? value[0] : value
    return typeof single === 'string' && single.length > 0 ? single : undefined
  })
}
