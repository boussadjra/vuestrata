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
import type { FetchResponse } from 'ofetch'
import type { MaybeRef, Ref } from 'vue'
import { z, type ZodType } from 'zod'

import { AppError, ERROR_MESSAGE_KEYS } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'

import { apiFetch, apiGet } from './client'

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

const collectionLogger = createScopedLogger('collection')

/**
 * Success statuses a write may answer without the record: a 201 that only
 * names it in `Location`, a 204 that by definition has no body, a 200 some
 * backends leave empty. Any other status that fails to parse is a broken
 * contract, not a missing body.
 */
const RECORDLESS_WRITE_STATUSES = new Set([200, 201, 204])

/**
 * What every read here tells the API client: the body is about to be parsed
 * as data, so a web page or a file in its place is an error to raise at once
 * (`UNEXPECTED_RESPONSE`), not a string to hand to a schema. A misrouted API
 * URL answered by a static host's fallback page is the usual cause.
 *
 * The writes do not say it. A create or an update may answer with no record
 * at all (see `writtenRecord`), and a delete's body is never read: a backend
 * that answers `OK` in plain text has still done what it was asked.
 */
const READS_JSON = { expectJson: true } as const

function isEmptyBody(body: unknown): boolean {
  return body === undefined || body === null || (typeof body === 'string' && body.trim() === '')
}

/** The id in an id-only body such as `{ "id": "ORD-1042" }`, or `undefined`. */
function idOnlyBody(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const id = (body as { id?: unknown }).id
  if (Object.keys(body).length !== 1) return undefined
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

/**
 * Where a 201's `Location` points, resolved against the URL that answered —
 * as RFC 9110 reads a relative `Location`, and not as the client resolves its
 * own paths, which would put the API prefix in twice. Only a same-origin
 * target is followed: the follow-up request carries the session's credentials.
 */
function createdLocation(response: FetchResponse<unknown>): string | undefined {
  const location = response.headers.get('location')
  if (!location || !response.url) return undefined
  try {
    const target = new URL(location, response.url)
    return target.origin === new URL(response.url).origin ? target.href : undefined
  } catch {
    return undefined
  }
}

/**
 * A response that arrived but does not have the agreed shape.
 *
 * The zod issues go into `details`, keyed by their path in the body. The log
 * line carries paths and issue codes only: never the body, and not the issue
 * messages either, which a custom refinement is free to fill with the value it
 * rejected.
 */
function contractMismatch(resource: string, issues: readonly z.core.$ZodIssue[]): AppError {
  const details: Record<string, string[]> = {}
  for (const issue of issues) {
    const path = issue.path.map(String).join('.') || '(root)'
    ;(details[path] ??= []).push(issue.message)
  }
  collectionLogger.error(`The response for "${resource}" does not match its schema`, {
    issues: issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code })),
  })
  return new AppError({
    message: 'The server sent a response this app could not read.',
    code: 'CONTRACT_MISMATCH',
    kind: 'contract',
    retryable: false,
    messageKey: ERROR_MESSAGE_KEYS.contract,
    details,
  })
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
  const recordPath = (id: string) => `/${resource}/${id}`

  /** Validate a response body, or fail as a contract mismatch. */
  function parse<S>(target: ZodType<S>, body: unknown): S {
    const result = target.safeParse(body)
    if (result.success) return result.data
    throw contractMismatch(resource, result.error.issues)
  }

  /**
   * Where to read the record back from, when a write's success carried none:
   * the id that was updated, or for a create its `Location`, else the id it
   * returned. `undefined` when the response is not recordless or names nothing.
   */
  function followUpPath(
    response: FetchResponse<unknown>,
    updatedId: string | undefined,
  ): string | undefined {
    if (!RECORDLESS_WRITE_STATUSES.has(response.status)) return undefined
    const returnedId = idOnlyBody(response._data)
    if (!isEmptyBody(response._data) && returnedId === undefined) return undefined
    if (updatedId !== undefined) return recordPath(updatedId)
    return (
      createdLocation(response) ?? (returnedId === undefined ? undefined : recordPath(returnedId))
    )
  }

  /**
   * The record a write produced.
   *
   * A body that parses is used as is, so the common case costs no extra
   * request. A success without the record — a 201 with only a `Location`, a
   * 204, an empty 200, a bare `{ id }` — is followed by a GET of what was
   * written, so mutations stay typed `T`. Parsing those bodies directly used
   * to report a failed save for a write that had succeeded, and invite the
   * user to submit it again.
   */
  async function writtenRecord(response: FetchResponse<unknown>, updatedId?: string): Promise<T> {
    const parsed = schema.safeParse(response._data)
    if (parsed.success) return parsed.data

    const path = followUpPath(response, updatedId)
    if (path === undefined) throw contractMismatch(resource, parsed.error.issues)
    return parse(schema, await apiGet<unknown>(path, READS_JSON))
  }

  function useList(filters: Ref<TFilters>) {
    const query = useQuery({
      queryKey: computed(() => keys.list(toQueryParams(filters.value))),
      queryFn: async ({ signal }) => {
        const raw = await apiGet<unknown>(`/${resource}`, {
          query: toQueryParams(filters.value),
          // A superseded page or search is aborted rather than left to run:
          // nothing will read it, and the server can stop working on it.
          signal,
          ...READS_JSON,
        })
        return parse(listSchema, raw)
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
      queryFn: async ({ signal }) =>
        parse(
          schema,
          await apiGet<unknown>(`/${resource}/${toValue(id)}`, { signal, ...READS_JSON }),
        ),
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
   *
   * Wired to `onSettled`, not `onSuccess`: a write that failed after reaching
   * the server — a timeout, an unreadable response — may well have happened,
   * and the lists must show it rather than keep the stale copy.
   */
  function useInvalidate() {
    const queryClient = useQueryClient()
    return () => void queryClient.invalidateQueries({ queryKey: keys.all })
  }

  function useCreate() {
    const invalidate = useInvalidate()
    return useMutation<T, Error, TCreate>({
      mutationFn: async (payload) =>
        writtenRecord(
          await apiFetch.raw<unknown>(`/${resource}`, {
            method: 'POST',
            body: payload as Record<string, unknown>,
          }),
        ),
      onSettled: invalidate,
    })
  }

  function useUpdate() {
    const invalidate = useInvalidate()
    return useMutation<T, Error, { id: string; patch: TUpdate }>({
      mutationFn: async ({ id, patch }) =>
        writtenRecord(
          await apiFetch.raw<unknown>(recordPath(id), {
            method: 'PATCH',
            body: patch as Record<string, unknown>,
          }),
          id,
        ),
      onSettled: invalidate,
    })
  }

  function useRemove() {
    const invalidate = useInvalidate()
    return useMutation<void, Error, string>({
      mutationFn: async (id) => {
        await apiFetch.raw(recordPath(id), { method: 'DELETE' })
      },
      onSettled: invalidate,
    })
  }

  return { useList, useDetail, useCreate, useUpdate, useRemove }
}
