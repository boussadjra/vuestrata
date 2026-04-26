/**
 * Shared pagination/filtering types and query-string builder for TanStack Query composables.
 */

/** Common fields shared by all list-query parameter types. */
export interface PaginationParams {
  page?: number
  pageSize?: number
  search?: string
}

/**
 * Build a URL query string from a flat params object.
 * Skips `undefined` / `null` values, coerces numbers to strings.
 */
export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      const stringValue =
        typeof value === 'object' ? JSON.stringify(value) : String(value as string | number)
      qs.set(key, stringValue)
    }
  }
  return qs.toString()
}
