/**
 * Query key factory utility and shared cross-module key definitions.
 *
 * Ownership rule:
 *   - API / server data  → TanStack Query composable + typed keys from this factory
 *   - UI / session state → Pinia store  (never both for the same entity)
 *
 * Each module owns its keys in `src/modules/<name>/query-keys.ts`
 * by calling `defineQueryKeys(moduleId)`.
 */

/**
 * Generic query-key factory that any module can use to build typed key sets.
 *
 * @example
 * // src/modules/users/query-keys.ts
 * export const usersKeys = defineQueryKeys('users')
 */
export function defineQueryKeys(module: string) {
  return {
    all: [module] as const,
    list: (params?: Record<string, unknown>) => [module, 'list', params] as const,
    detail: (id: string) => [module, 'detail', id] as const,
    action: (action: string, params?: Record<string, unknown>) => [module, action, params] as const,
  }
}
