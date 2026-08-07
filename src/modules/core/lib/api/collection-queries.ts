/**
 * The query half of the collection contract.
 *
 * `createCollectionMock` (demo builds) and this factory are two ends of the same
 * wire: one serves `{ data, meta }` for `/{resource}`, the other reads it. The
 * response is validated against a zod schema on arrival, so a backend that
 * drifts from the agreed shape fails loudly at the boundary instead of
 * rendering `undefined` three components deep — the exact failure the dashboard
 * suffered before Phase 5.
 *
 * Domain modules call this once and export the result; they do not re-implement
 * pagination plumbing.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationReturnType,
} from '@tanstack/vue-query'
import type { MaybeRef, Ref } from 'vue'
import { z, type ZodType } from 'zod'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'

/** Filters every collection list accepts. Domains extend this with their own. */
export interface CollectionFilters {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PageMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const pageMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
})

/**
 * Turn a filter object into query parameters.
 *
 * `undefined`, `null`, `''` and `'all'` are all dropped. Sending `role=` or
 * `role=all` to a backend that filters on exact match returns zero rows, which
 * reads to the user as "no results" when they have in fact just *cleared* the
 * filter.
 */
export function toQueryParams(filters: object): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue

    // Only primitives become parameters. An object or array reaching here is a
    // bug in the caller, and `String({})` would quietly send `[object Object]`
    // — a filter the server cannot match, producing an empty list with no
    // indication of why. Dropping it at least leaves the list correct.
    if (typeof value === 'object') continue

    params[key] = typeof value === 'string' ? value : String(value as number | boolean)
  }
  return params
}

export interface CollectionQueryKeys {
  all: readonly unknown[]
  list: (params?: Record<string, unknown>) => readonly unknown[]
  detail: (id: string) => readonly unknown[]
}

export interface CollectionApi<T, TFilters extends CollectionFilters, TCreate, TUpdate> {
  useList: (filters: Ref<TFilters>) => {
    items: Ref<T[]>
    meta: Ref<PageMeta | null>
    isPending: Ref<boolean>
    isFetching: Ref<boolean>
    isError: Ref<boolean>
    error: Ref<Error | null>
    refetch: () => void
  }
  useDetail: (id: MaybeRef<string | undefined>) => {
    item: Ref<T | undefined>
    isPending: Ref<boolean>
    isError: Ref<boolean>
    error: Ref<Error | null>
    refetch: () => void
  }
  useCreate: () => UseMutationReturnType<T, Error, TCreate, unknown>
  useUpdate: () => UseMutationReturnType<T, Error, { id: string; patch: TUpdate }, unknown>
  useRemove: () => UseMutationReturnType<void, Error, string, unknown>
}

export function createCollectionApi<
  T,
  TFilters extends CollectionFilters = CollectionFilters,
  TCreate = Partial<T>,
  TUpdate = Partial<T>,
>(config: {
  resource: string
  schema: ZodType<T>
  keys: CollectionQueryKeys
}): CollectionApi<T, TFilters, TCreate, TUpdate> {
  const { resource, schema, keys } = config
  const listSchema = z.object({ data: z.array(schema), meta: pageMetaSchema })

  function useList(filters: Ref<TFilters>) {
    const query = useQuery({
      queryKey: computed(() => keys.list(toQueryParams(filters.value))),
      queryFn: async () => {
        const raw = await apiGet<unknown>(`/${resource}`, { query: toQueryParams(filters.value) })
        return listSchema.parse(raw)
      },
      // Hold the previous page while the next one loads. Without it every
      // filter keystroke empties the table and the layout jumps.
      placeholderData: (previous) => previous,
      staleTime: 30_000,
    })

    return {
      items: computed(() => query.data.value?.data ?? []),
      meta: computed(() => query.data.value?.meta ?? null),
      isPending: computed(() => query.isPending.value),
      isFetching: computed(() => query.isFetching.value),
      isError: computed(() => query.isError.value),
      error: computed(() => query.error.value),
      refetch: () => void query.refetch(),
    }
  }

  function useDetail(id: MaybeRef<string | undefined>) {
    const query = useQuery({
      queryKey: computed(() => keys.detail(toValue(id) ?? '')),
      queryFn: async () => schema.parse(await apiGet<unknown>(`/${resource}/${toValue(id)}`)),
      // Route params arrive before the component that reads them has mounted;
      // firing `/orders/undefined` produces a 404 the user briefly sees.
      enabled: computed(() => Boolean(toValue(id))),
    })

    return {
      item: computed(() => query.data.value),
      isPending: computed(() => query.isPending.value),
      isError: computed(() => query.isError.value),
      error: computed(() => query.error.value),
      refetch: () => void query.refetch(),
    }
  }

  /**
   * Invalidate every key under this resource after a write.
   *
   * Deliberately broad: a create changes which page a record falls on, an
   * update can change its sort position, and a delete shifts every subsequent
   * page. Surgically patching one cached list leaves the other twelve wrong.
   */
  function useInvalidate() {
    const queryClient = useQueryClient()
    return () => void queryClient.invalidateQueries({ queryKey: keys.all })
  }

  function useCreate() {
    const invalidate = useInvalidate()
    return useMutation<T, Error, TCreate>({
      mutationFn: async (payload) =>
        schema.parse(await apiPost<unknown>(`/${resource}`, payload as Record<string, unknown>)),
      onSuccess: invalidate,
    })
  }

  function useUpdate() {
    const invalidate = useInvalidate()
    return useMutation<T, Error, { id: string; patch: TUpdate }>({
      mutationFn: async ({ id, patch }) =>
        schema.parse(
          await apiPatch<unknown>(`/${resource}/${id}`, patch as Record<string, unknown>),
        ),
      onSuccess: invalidate,
    })
  }

  function useRemove() {
    const invalidate = useInvalidate()
    return useMutation<void, Error, string>({
      mutationFn: async (id) => {
        await apiDelete<void>(`/${resource}/${id}`)
      },
      onSuccess: invalidate,
    })
  }

  return { useList, useDetail, useCreate, useUpdate, useRemove }
}
