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
 *
 * What is on the wire is a dialect's business (`dialects.ts`): the parameter
 * names, the envelope, the case of the keys, PATCH or PUT. This file never
 * names a backend. With no dialect named anywhere it speaks Vuestrata's own
 * contract, as it did before dialects existed. And a collection need not be
 * REST at all: given a `source`, the same composables run on a handful of
 * functions, which is how an SDK (Supabase, Firebase, a GraphQL client) drives
 * a table.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationReturnType,
} from '@tanstack/vue-query'
import type { FetchResponse } from 'ofetch'
import type { MaybeRef, MaybeRefOrGetter, Ref } from 'vue'
import { z, type ZodType } from 'zod'

import { AppError, ERROR_MESSAGE_KEYS, normalizeError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'

import { apiFetch, apiGet } from './client'
import {
  apiPath,
  keysToApp,
  keysToWire,
  listContext,
  pageMetaOf,
  pathSegment,
  resolveCollectionDialect,
  schemaKeyPlan,
  vuestrataDialect,
  type CollectionDialect,
  type KeyPlan,
  type ListContext,
  type ResolvedCollectionDialect,
} from './dialects'
import { currentApiIntegration } from './integration'

export { toCollectionParams } from './dialects'

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

/**
 * What a list read by cursor reports in place of page counts. There is no
 * page number and usually no total: only whether there is more, and the
 * cursor that asks for it.
 */
export interface CursorMeta {
  nextCursor: string | null
  prevCursor: string | null
  hasMore: boolean
  total?: number
  pageSize?: number
}

const pageMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
})

const cursorMetaSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  prevCursor: z.string().min(1).nullable().default(null),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().positive().optional(),
})

/**
 * Turn a filter object into query parameters.
 *
 * `undefined`, `null`, `''` and `'all'` are all dropped. Sending `role=` or
 * `role=all` to a backend that filters on exact match returns zero rows, which
 * reads to the user as "no results" when they have in fact just *cleared* the
 * filter.
 *
 * @deprecated Use `toCollectionParams(filters, dialect)`, which writes the
 * parameters the way a given backend reads them and can send lists and ranges.
 * This function is what `toCollectionParams(filters, dialects.vuestrata)`
 * returns, and stays for code that calls it.
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

/** What `useList` returns. */
export interface CollectionList<T> {
  items: Ref<T[]>
  meta: Ref<PageMeta | null>
  isPending: Ref<boolean>
  isFetching: Ref<boolean>
  isError: Ref<boolean>
  error: Ref<Error | null>
  refetch: () => void
}

/** What `useDetail` returns. */
export interface CollectionDetail<T> {
  item: Ref<T | undefined>
  isPending: Ref<boolean>
  isError: Ref<boolean>
  error: Ref<Error | null>
  refetch: () => void
}

/**
 * What `useInfiniteList` returns: every page loaded so far as one list, and
 * the means to ask for the next.
 */
export interface InfiniteList<T> {
  /** The rows of every loaded page, in order. */
  items: Ref<T[]>
  /** The total the backend reported with its latest page, when it reports one. */
  total: Ref<number | undefined>
  /** Whether the backend has more to give. */
  hasMore: Ref<boolean>
  /** Load the next page. Does nothing while one is loading or when there is none. */
  loadMore: () => void
  isPending: Ref<boolean>
  isFetching: Ref<boolean>
  /** Whether the request in flight is one `loadMore` started. */
  isLoadingMore: Ref<boolean>
  isError: Ref<boolean>
  error: Ref<Error | null>
  refetch: () => void
}

/**
 * A call that is not one of the five: `POST /orders/{id}/cancel`,
 * `POST /orders/bulk-delete`, `PATCH /users/{id}/role`.
 */
export interface CollectionActionConfig<
  TInput,
  TOutput,
  TPath extends string | ((id: string) => string),
> {
  /** Defaults to `POST`. */
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /**
   * Where the call goes. A function of the record's id makes it an action on
   * one record, and `id` a required part of what the mutation is called with.
   *
   * On a collection, a path that does not start with `/` continues the
   * collection's own: `(id) => \`${id}/cancel\`` is `/orders/{id}/cancel`, with
   * the trailing slash of a dialect that writes one. One that starts with `/`
   * is taken from the API root, and sent as written.
   *
   * The function is given the id already encoded as one path segment: write
   * it into the path as it is. An id no path can hold (`''`, `.`, `..`) fails
   * the call as `INVALID_ID`, and a path that leaves the API (a `..` segment,
   * a backslash, a leading `//`) as `INVALID_PATH`, before anything is sent.
   */
  path: TPath
  /**
   * The request body's schema. The input is parsed with it before anything is
   * sent, and what is sent is the parsed value; an input that does not match
   * rejects the mutation with an `AppError` (`INVALID_INPUT`) whose `details`
   * name the fields. Without it the action sends no body.
   */
  input?: ZodType<TInput>
  /**
   * The response's schema: the mutation resolves with the parsed record, and
   * a response that does not match fails as `CONTRACT_MISMATCH`. Without it
   * the response is not read and the mutation resolves with nothing.
   */
  output?: ZodType<TOutput>
  /**
   * The query keys to invalidate once the call has settled. On a collection
   * the default is everything under it; a standalone action invalidates
   * nothing unless told.
   */
  invalidates?: readonly (readonly unknown[])[]
}

/** What an action's mutation is called with. */
export type ActionVariables<TInput, TPath> = (TPath extends string
  ? { id?: undefined }
  : { id: string }) &
  ([TInput] extends [undefined] ? { input?: undefined } : { input: TInput })

/** The composable an action is: call it in `setup`, as any mutation composable. */
export type CollectionAction<TInput, TOutput, TPath> = () => UseMutationReturnType<
  TOutput,
  Error,
  ActionVariables<TInput, TPath>,
  unknown
>

/** The composables of a collection. */
export interface CollectionComposables<T, TFilters extends CollectionFilters, TCreate, TUpdate> {
  useList: (filters: Ref<TFilters>) => CollectionList<T>
  useDetail: (id: MaybeRef<string | undefined>) => CollectionDetail<T>
  useCreate: () => UseMutationReturnType<T, Error, TCreate, unknown>
  useUpdate: () => UseMutationReturnType<T, Error, { id: string; patch: TUpdate }, unknown>
  useRemove: () => UseMutationReturnType<void, Error, string, unknown>
  /**
   * The list, read a page at a time and kept as one: "load more" and endless
   * scrolling. The only way to read a dialect that pages by cursor, and it
   * works on any other: there it asks for page 1, 2, 3 in turn. `page` and
   * `cursor` in the filters are ignored: this composable sets them.
   */
  useInfiniteList: (filters: Ref<TFilters>) => InfiniteList<T>
  /** Declare a call that is not one of the five. See `CollectionActionConfig`. */
  action: <
    TOutput = void,
    TInput = undefined,
    TPath extends string | ((id: string) => string) = string | ((id: string) => string),
  >(
    config: CollectionActionConfig<TInput, TOutput, TPath>,
  ) => CollectionAction<TInput, TOutput, TPath>
}

export interface CollectionApi<
  T,
  TFilters extends CollectionFilters,
  TCreate,
  TUpdate,
  TParent = Record<string, string>,
> extends CollectionComposables<T, TFilters, TCreate, TUpdate> {
  /**
   * The same composables under one parent: for a nested resource, whose
   * `path` is a function of the parent's ids.
   *
   *     const contacts = contactsApi.within(() => ({ customerId: props.customerId }))
   *     const { items } = contacts.useList(filters)
   *
   * The parent may be a ref or a getter. Nothing is requested until every one
   * of its ids has a value, and what is cached is cached per parent.
   */
  within: (
    parent: MaybeRefOrGetter<TParent | null | undefined>,
  ) => CollectionComposables<T, TFilters, TCreate, TUpdate>
}

/** What `createCollectionApi` takes for a collection served over REST. */
export interface CollectionConfig<T, TParent = Record<string, string>> {
  /** The path segment: `orders` is `/orders`. Also names the collection in log lines. */
  resource: string
  schema: ZodType<T>
  keys: CollectionQueryKeys
  /**
   * How this collection's backend speaks, when it is not how the project's
   * does: one of `dialects`, or your own. Without it the collection uses the
   * project's (`collection`, or the `backend` preset, in
   * `app/config/api.overrides.ts`), and without that, Vuestrata's contract.
   */
  dialect?: CollectionDialect
  /**
   * The method an update is sent with, when it is not the dialect's. `PUT`
   * replaces the record: pass the whole of it as the patch.
   */
  updateMethod?: 'PATCH' | 'PUT'
  /**
   * The collection's path, when it is not `/{resource}`: `'/v2/orders'`. For
   * a nested resource, a function of the parent's ids, read with `within()`:
   *
   *     path: ({ customerId }) => `/customers/${customerId}/contacts`
   *
   * The function is given the parent's ids already encoded, each as one path
   * segment: write them into the path as they are.
   */
  path?: string | ((parent: TParent) => string)
}

/** What a source's reads are given. */
export interface CollectionSourceContext {
  /** Aborted when the result is no longer wanted. Pass it to the SDK if it takes one. */
  signal: AbortSignal
}

/**
 * A collection that is not a REST endpoint: five functions over an SDK.
 *
 * `list` answers with the rows and how many there are in all:
 *
 *   { items, total }   the usual case. The page number and size are taken
 *                      from the filters
 *   { items, meta }    `meta` as the app's own `{ total, page, pageSize,
 *                      totalPages }`, or for `useInfiniteList` a cursor's
 *                      `{ nextCursor, hasMore }`
 *   [...]              a bare array: everything there is, as one page
 *
 * The filters arrive as the app wrote them (`page` from 1, `pageSize`,
 * `search`, `sortBy`, `sortOrder`, and the domain's own), minus the cleared
 * ones: `''`, `'all'`, `null`. `useInfiniteList` adds `cursor` once the source
 * has answered with one.
 *
 * Rows and records are validated against the collection's schema exactly as
 * a REST answer is, so map the SDK's shape to the app's in here. Whatever
 * these functions throw reaches the UI as an `AppError`. A `get` that answers
 * `null` or nothing is a 404: the record page shows "not found".
 *
 * Leave out `create`, `update` or `remove` and the collection has no
 * `useCreate`, `useUpdate` or `useRemove`.
 */
export interface CollectionSource<TFilters = object, TCreate = unknown, TUpdate = unknown> {
  list(filters: TFilters, context: CollectionSourceContext): unknown
  get(id: string, context: CollectionSourceContext): unknown
  create?(input: TCreate): unknown
  update?(id: string, patch: TUpdate): unknown
  remove?(id: string): unknown
}

/** What `createCollectionApi` takes for a collection served by a source. */
export interface SourceCollectionConfig<T, TSource extends CollectionSource> {
  source: TSource
  schema: ZodType<T>
  keys: CollectionQueryKeys
  /** Names the collection in log lines. Defaults to the first part of `keys.all`. */
  resource?: string
}

type SourceFilters<TSource> = TSource extends {
  list: (filters: infer TFilters, context: CollectionSourceContext) => unknown
}
  ? TFilters
  : CollectionFilters

/**
 * The composables of a source-backed collection. The mutations are present
 * only for the functions the source has.
 */
export type SourceCollectionApi<T, TSource> = {
  useList: (filters: Ref<SourceFilters<TSource>>) => CollectionList<T>
  useDetail: (id: MaybeRef<string | undefined>) => CollectionDetail<T>
  useInfiniteList: (filters: Ref<SourceFilters<TSource>>) => InfiniteList<T>
} & (TSource extends { create: (input: infer TCreate) => unknown }
  ? { useCreate: () => UseMutationReturnType<T, Error, TCreate, unknown> }
  : unknown) &
  (TSource extends { update: (id: string, patch: infer TUpdate) => unknown }
    ? {
        useUpdate: () => UseMutationReturnType<T, Error, { id: string; patch: TUpdate }, unknown>
      }
    : unknown) &
  (TSource extends { remove: (id: string) => unknown }
    ? { useRemove: () => UseMutationReturnType<void, Error, string, unknown> }
    : unknown)

const collectionLogger = createScopedLogger('collection')

/** The contract before dialects existed, and still the one nothing has to name. */
const DEFAULT_DIALECT = resolveCollectionDialect(vuestrataDialect)

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

/** The issues of a failed parse, by their path in the body. */
function issueDetails(issues: readonly z.core.$ZodIssue[]): Record<string, string[]> {
  const details: Record<string, string[]> = {}
  for (const issue of issues) {
    const path = issue.path.map(String).join('.') || '(root)'
    // `Object.hasOwn`, not `??=`: a field may be called `constructor`.
    if (!Object.hasOwn(details, path)) {
      Object.defineProperty(details, path, {
        value: [],
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    details[path]!.push(issue.message)
  }
  return details
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
  collectionLogger.error(`The response for "${resource}" does not match its schema`, {
    issues: issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code })),
  })
  return new AppError({
    message: 'The server sent a response this app could not read.',
    code: 'CONTRACT_MISMATCH',
    kind: 'contract',
    retryable: false,
    messageKey: ERROR_MESSAGE_KEYS.contract,
    details: issueDetails(issues),
  })
}

/** An action's input that its own schema refused: nothing was sent. */
function invalidInput(resource: string, issues: readonly z.core.$ZodIssue[]): AppError {
  collectionLogger.warn(`An action on "${resource}" was given an input its schema refuses`, {
    issues: issues.map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code })),
  })
  return new AppError({
    message: 'Validation failed. Please check your input.',
    code: 'INVALID_INPUT',
    status: 422,
    kind: 'unknown',
    retryable: false,
    messageKey: 'errors.status_422',
    details: issueDetails(issues),
  })
}

/** An issue for a body the dialect did not recognise as a list at all. */
function notAListIssue(dialectName: string): z.core.$ZodIssue {
  return {
    code: 'custom',
    path: [],
    message: `Not a list in the "${dialectName}" dialect`,
    input: undefined,
  }
}

/**
 * What a source threw, as the error the rest of the app handles.
 *
 * `normalizeError` knows `Error`s, aborts and HTTP failures. An SDK is as
 * likely to throw (or return for throwing) a plain object: Supabase's
 * `{ message, code, details, hint }`. Its message and code are kept.
 */
function sourceError(thrown: unknown): AppError {
  const normalized = normalizeError(thrown)
  // An `Error`, or anything `normalizeError` recognised (an abort is one
  // whatever it inherits from), is already what it should be.
  if (
    thrown instanceof Error ||
    normalized.code !== 'UNKNOWN_ERROR' ||
    !isRecord(thrown) ||
    typeof thrown.message !== 'string'
  ) {
    return normalized
  }
  const status = Number(thrown.status ?? thrown.statusCode)
  return new AppError({
    message: thrown.message,
    code: typeof thrown.code === 'string' && thrown.code !== '' ? thrown.code : 'SOURCE_ERROR',
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
    kind: 'unknown',
    messageKey: ERROR_MESSAGE_KEYS.unknown,
  })
}

/** A cleared filter: what `toQueryParams` has always dropped. */
function isCleared(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === 'all'
}

/** The filters a source is given: everything but the cleared ones. */
function presentFilters(filters: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => !isCleared(value)))
}

/**
 * Whether every id a nested path needs is there. "Not there yet" is nothing
 * at all (`null`, `undefined`, `''`), which is what a route parameter is
 * before its page has it. Not the cleared-filter test: `all` is a filter's
 * word for "no filter", and a perfectly good id.
 */
function isCompleteParent(parent: unknown): parent is Record<string, unknown> {
  return (
    isRecord(parent) &&
    Object.values(parent).every((value) => value !== undefined && value !== null && value !== '')
  )
}

/**
 * A parent as a nested path's template is given it: every id encoded as one
 * path segment, and an id no path can hold refused (see `pathSegment`).
 */
function encodedParent(parent: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parent).map(([name, value]) => [
      name,
      pathSegment(value, `parent id "${name}"`),
    ]),
  )
}

/** Validate a value against a schema, or fail as a contract mismatch. */
function parseAs<S>(resource: string, target: ZodType<S>, body: unknown): S {
  const result = target.safeParse(body)
  if (result.success) return result.data
  throw contractMismatch(resource, result.error.issues)
}

interface ListPage<T> {
  data: T[]
  meta: PageMeta
}

interface InfinitePage<T> {
  data: T[]
  meta: PageMeta | CursorMeta
}

/** What `useInfiniteList` asks the next page by: a page number, a cursor, or nothing yet. */
type PageParam = string | number | null

/** Whether a list's meta is a cursor's rather than page counts. Not yet validated. */
function isCursorShaped(meta: unknown): meta is Record<string, unknown> {
  return isRecord(meta) && ('nextCursor' in meta || 'hasMore' in meta)
}

function nextPageParam<T>(last: InfinitePage<T>): PageParam | undefined {
  if ('hasMore' in last.meta) {
    return last.meta.hasMore && last.meta.nextCursor !== null ? last.meta.nextCursor : undefined
  }
  // An empty page ends the list whatever the counts say: a total that moved
  // while the user was reading must not turn "load more" into a loop.
  return last.data.length > 0 && last.meta.page < last.meta.totalPages
    ? last.meta.page + 1
    : undefined
}

/**
 * Where a collection's rows come from: REST through a dialect, or a source.
 * The composables are written once, over this.
 */
interface Backend<T, TFilters, TCreate, TUpdate> {
  /** What a list is cached under. */
  listKey: (filters: object) => Record<string, unknown>
  list: (filters: TFilters, signal: AbortSignal) => Promise<ListPage<T>>
  page: (filters: TFilters, param: PageParam, signal: AbortSignal) => Promise<InfinitePage<T>>
  get: (id: string, signal: AbortSignal) => Promise<T>
  create?: (input: TCreate) => Promise<T>
  update?: (id: string, patch: TUpdate) => Promise<T>
  remove?: (id: string) => Promise<void>
}

/** Where a set of composables keeps its cache entries, and whether it may ask yet. */
interface Scope {
  listKey: (params: Record<string, unknown>) => readonly unknown[]
  detailKey: (id: string) => readonly unknown[]
  /** Absent when there is nothing to wait for. */
  ready?: () => boolean
}

/** The key transform of a dialect, applied with what a schema says to leave alone. */
function keyCase(dialect: ResolvedCollectionDialect, plan: () => KeyPlan) {
  return {
    toApp: (value: unknown) => (dialect.keys ? keysToApp(value, dialect.keys, plan()) : value),
    toWire: (value: unknown) => (dialect.keys ? keysToWire(value, dialect.keys, plan()) : value),
  }
}

/** Computes a schema's key plan once, when a dialect first needs it. */
function lazyKeyPlan(schema: unknown): () => KeyPlan {
  const cache: { plan?: KeyPlan } = {}
  return () => (cache.plan ??= schemaKeyPlan(schema))
}

interface ActionRuntime {
  resource: string
  dialect: () => ResolvedCollectionDialect
  /** The full path for what the action's `path` named. */
  resolvePath: (target: string, dialect: ResolvedCollectionDialect) => string
  defaultInvalidates: readonly (readonly unknown[])[]
}

/**
 * What an action's `path` names, for one call.
 *
 * A path function is handed the id already encoded as one path segment, and
 * never an id no path can hold (`pathSegment` refuses it), so nothing a record
 * is called can reach outside the segment the template gave it. That is also
 * why a leading `/` in the result is the template's own: an encoded id holds
 * no slash, so it cannot turn a path that continues the collection's into one
 * from the API root. What the template itself wrote is checked by `apiPath`.
 */
function actionTarget(path: string | ((id: string) => string), id: unknown): string {
  return apiPath(typeof path === 'function' ? path(pathSegment(id)) : path)
}

function defineAction<TInput, TOutput, TPath extends string | ((id: string) => string)>(
  config: CollectionActionConfig<TInput, TOutput, TPath>,
  runtime: ActionRuntime,
): CollectionAction<TInput, TOutput, TPath> {
  const inputPlan = lazyKeyPlan(config.input)
  const outputPlan = lazyKeyPlan(config.output)
  const invalidates = config.invalidates ?? runtime.defaultInvalidates

  return function useAction() {
    const queryClient = useQueryClient()
    return useMutation<TOutput, Error, ActionVariables<TInput, TPath>>({
      mutationFn: async (variables) => {
        const dialect = runtime.dialect()
        const given = variables as { id?: string; input?: unknown } | undefined

        const body: { value?: unknown } = {}
        if (config.input) {
          const checked = config.input.safeParse(given?.input)
          if (!checked.success) throw invalidInput(runtime.resource, checked.error.issues)
          body.value = keyCase(dialect, inputPlan).toWire(checked.data)
        }

        const target = actionTarget(config.path, given?.id)
        const response = await apiFetch.raw<unknown>(runtime.resolvePath(target, dialect), {
          method: config.method ?? 'POST',
          ...(body.value === undefined ? {} : { body: body.value as Record<string, unknown> }),
        })

        if (!config.output) return undefined as TOutput
        return parseAs(
          runtime.resource,
          config.output,
          keyCase(dialect, outputPlan).toApp(dialect.unwrapRecord(response._data)),
        )
      },
      // Settled, not succeeded: see `useInvalidate` in `createCollectionApi`.
      onSettled: () => {
        for (const queryKey of invalidates) void queryClient.invalidateQueries({ queryKey })
      },
    })
  }
}

/**
 * A validated call that belongs to no collection: `POST /invitations`,
 * `PATCH /users/{id}/role` in a module whose list is not a collection.
 *
 * The same as a collection's `action()`, with two differences: `path` is
 * always from the API root, so it starts with `/` (one that does not is
 * refused as `INVALID_PATH`: there is no collection path for it to continue),
 * and nothing is invalidated unless `invalidates` says so. For a call to
 * another origin, use `apiFetch` itself, which makes that an explicit choice
 * (`trusted`). The project's dialect still applies to the record that comes back
 * (its envelope, its key case), unless `dialect` names another.
 *
 *     const useCancelInvitation = createApiAction({
 *       method: 'DELETE',
 *       path: (id) => `/invitations/${id}`,
 *       invalidates: [invitationKeys.all],
 *     })
 */
export function createApiAction<
  TOutput = void,
  TInput = undefined,
  TPath extends string | ((id: string) => string) = string | ((id: string) => string),
>(
  config: CollectionActionConfig<TInput, TOutput, TPath> & {
    /** Names the call in log lines. Defaults to `action`. */
    resource?: string
    dialect?: CollectionDialect
  },
): CollectionAction<TInput, TOutput, TPath> {
  const own = config.dialect === undefined ? undefined : resolveCollectionDialect(config.dialect)
  return defineAction(config, {
    resource: config.resource ?? 'action',
    dialect: () => own ?? currentApiIntegration().collection ?? DEFAULT_DIALECT,
    resolvePath: (target) => {
      // Belonging to no collection, the path has nothing to continue: one
      // that does not start at the API root is a template that put an id, or
      // a whole URL, where the root belongs.
      if (target.startsWith('/')) return target
      throw new AppError({
        message: 'A standalone action path starts with "/": it is taken from the API root.',
        code: 'INVALID_PATH',
        status: 400,
        kind: 'unknown',
        retryable: false,
        messageKey: 'errors.status_400',
      })
    },
    defaultInvalidates: [],
  })
}

export function createCollectionApi<
  T,
  TFilters extends CollectionFilters = CollectionFilters,
  TCreate = Partial<T>,
  TUpdate = Partial<T>,
  TParent = Record<string, string>,
>(config: CollectionConfig<T, TParent>): CollectionApi<T, TFilters, TCreate, TUpdate, TParent>
export function createCollectionApi<T, TSource extends CollectionSource>(
  config: SourceCollectionConfig<T, TSource>,
): SourceCollectionApi<T, TSource>
export function createCollectionApi<T, TFilters extends CollectionFilters, TCreate, TUpdate>(
  config:
    | CollectionConfig<T, Record<string, unknown>>
    | SourceCollectionConfig<T, CollectionSource>,
): unknown {
  const { schema, keys } = config
  const named = config.resource ?? keys.all[0]
  const resource = typeof named === 'string' ? named : 'collection'
  const listSchema = z.object({ data: z.array(schema), meta: pageMetaSchema })
  const cursorListSchema = z.object({ data: z.array(schema), meta: cursorMetaSchema })
  const keyPlan = lazyKeyPlan(schema)

  /** Validate a response body, or fail as a contract mismatch. */
  function parse<S>(target: ZodType<S>, body: unknown): S {
    return parseAs(resource, target, body)
  }

  // ─── REST ─────────────────────────────────────────────────────────────────

  const ownDialect =
    'dialect' in config && config.dialect !== undefined
      ? resolveCollectionDialect(config.dialect)
      : undefined

  /**
   * The dialect in force, read on every call. The project's is installed at
   * boot, after the module that called `createCollectionApi` was evaluated.
   */
  function dialect(): ResolvedCollectionDialect {
    return ownDialect ?? currentApiIntegration().collection ?? DEFAULT_DIALECT
  }

  function restBackend(base: () => string): Backend<T, TFilters, TCreate, TUpdate> {
    const updateMethod = 'updateMethod' in config ? config.updateMethod : undefined
    const recordPath = (id: string) => dialect().paths.detail(base(), id)

    /** A record, out of a detail's or a write's body. */
    function record(raw: unknown, spoken: ResolvedCollectionDialect) {
      return keyCase(spoken, keyPlan).toApp(spoken.unwrapRecord(raw))
    }

    /** The rows and the totals out of a list's body, validated as `envelope`. */
    function readPage<S>(
      raw: unknown,
      context: ListContext,
      spoken: ResolvedCollectionDialect,
      envelope: ZodType<S>,
    ): S {
      const found = spoken.parseList(raw, context)
      if (found === null) {
        // Not this dialect's envelope at all. The issues are those of reading
        // the body as the app's own, which for a body that is not even an
        // object says exactly that.
        const outcome = envelope.safeParse(raw)
        throw contractMismatch(
          resource,
          outcome.success ? [notAListIssue(spoken.name)] : outcome.error.issues,
        )
      }
      const { toApp } = keyCase(spoken, keyPlan)
      // Row by row: the schema's paths are those of one record.
      const data = Array.isArray(found.items) ? found.items.map(toApp) : found.items
      return parse(envelope, { data, meta: found.meta })
    }

    async function requestPage<S>(filters: object, envelope: ZodType<S>, signal: AbortSignal) {
      const spoken = dialect()
      const response = await apiFetch.raw<unknown>(spoken.paths.list(base()), {
        method: 'GET',
        query: spoken.toListQuery(filters as Record<string, unknown>),
        // A superseded page or search is aborted rather than left to run:
        // nothing will read it, and the server can stop working on it.
        signal,
        ...READS_JSON,
      })
      return readPage(response._data, listContext(filters, response.headers), spoken, envelope)
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
      const returnedId = idOnlyBody(dialect().unwrapRecord(response._data))
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
      const spoken = dialect()
      const parsed = schema.safeParse(record(response._data, spoken))
      if (parsed.success) return parsed.data

      const path = followUpPath(response, updatedId)
      if (path === undefined) throw contractMismatch(resource, parsed.error.issues)
      return parse(schema, record(await apiGet<unknown>(path, READS_JSON), spoken))
    }

    /** A write's body: keys in the backend's case, then whatever the dialect wraps it in. */
    function writeBody(payload: unknown, operation: 'create' | 'update', id?: string) {
      const spoken = dialect()
      return spoken.wrapRecord(keyCase(spoken, keyPlan).toWire(payload), {
        operation,
        resource,
        ...(id === undefined ? {} : { id }),
      }) as Record<string, unknown>
    }

    return {
      listKey: (filters) => dialect().toListQuery(filters as Record<string, unknown>),

      list: async (filters, signal) => {
        if (dialect().query.paging === 'cursor') {
          throw new Error(
            `The "${dialect().name}" dialect pages by cursor, which has no page numbers ` +
              `to show: read "${resource}" with useInfiniteList instead of useList.`,
          )
        }
        return requestPage(filters, listSchema, signal)
      },

      page: async (filters, param, signal) => {
        const byCursor = dialect().query.paging === 'cursor'
        return byCursor
          ? requestPage(
              { ...filters, page: undefined, cursor: param ?? undefined },
              cursorListSchema,
              signal,
            )
          : requestPage({ ...filters, cursor: undefined, page: param ?? 1 }, listSchema, signal)
      },

      get: async (id, signal) => {
        const spoken = dialect()
        return parse(
          schema,
          record(await apiGet<unknown>(recordPath(id), { signal, ...READS_JSON }), spoken),
        )
      },

      create: async (payload) =>
        writtenRecord(
          await apiFetch.raw<unknown>(dialect().paths.list(base()), {
            method: 'POST',
            body: writeBody(payload, 'create'),
          }),
        ),

      update: async (id, patch) =>
        writtenRecord(
          await apiFetch.raw<unknown>(recordPath(id), {
            method: updateMethod ?? dialect().updateMethod,
            body: writeBody(patch, 'update', id),
          }),
          id,
        ),

      remove: async (id) => {
        await apiFetch.raw(recordPath(id), { method: 'DELETE' })
      },
    }
  }

  // ─── A source ─────────────────────────────────────────────────────────────

  function sourceBackend(source: CollectionSource): Backend<T, TFilters, TCreate, TUpdate> {
    /** Run one of the source's functions; whatever it throws becomes an `AppError`. */
    async function run(call: () => unknown): Promise<unknown> {
      try {
        return await call()
      } catch (thrown) {
        throw sourceError(thrown)
      }
    }

    /** What `list` answered, as the envelope the schemas read. */
    function envelopeOf(answer: unknown, filters: object): { data: unknown; meta: unknown } | null {
      const context = listContext(filters)
      const counted = (items: unknown, total: unknown) => ({
        data: items,
        meta: pageMetaOf({
          total,
          page: context.page,
          pageSize: context.pageSize ?? Math.max(Array.isArray(items) ? items.length : 0, 1),
        }),
      })
      if (Array.isArray(answer)) return counted(answer, answer.length)
      if (!isRecord(answer)) return null
      if (isCursorShaped(answer.meta)) {
        // A source that names the next cursor has said whether there is more.
        const hasMore = answer.meta.hasMore ?? !isCleared(answer.meta.nextCursor)
        return { data: answer.items, meta: { nextCursor: null, ...answer.meta, hasMore } }
      }
      return isRecord(answer.meta)
        ? { data: answer.items, meta: answer.meta }
        : counted(answer.items, answer.total)
    }

    async function requestPage(filters: object, signal: AbortSignal) {
      const present = presentFilters(filters)
      const answer = await run(() => source.list(present, { signal }))
      const envelope = envelopeOf(answer, present)
      if (envelope === null) throw contractMismatch(resource, [notAListIssue('source')])
      return envelope
    }

    /** The record a write produced, read back when the source answered without it. */
    async function writtenRecord(answer: unknown, id: string | undefined): Promise<T> {
      const parsed = schema.safeParse(answer)
      if (parsed.success) return parsed.data

      const written = id ?? idOnlyBody(answer)
      if (written === undefined || !(isEmptyBody(answer) || idOnlyBody(answer) !== undefined)) {
        throw contractMismatch(resource, parsed.error.issues)
      }
      return readRecord(written, new AbortController().signal)
    }

    /**
     * One record. A source that answers `null` or nothing has said there is
     * none, which is the 404 a REST backend gives: the page shows "not found"
     * (`isNotFoundError`), where a schema error would offer a pointless retry.
     */
    async function readRecord(id: string, signal: AbortSignal): Promise<T> {
      const answer = await run(() => source.get(id, { signal }))
      if (answer === null || answer === undefined) {
        throw new AppError({
          message: 'The requested resource was not found.',
          code: 'NOT_FOUND',
          status: 404,
          kind: 'http',
          retryable: false,
          messageKey: 'errors.status_404',
        })
      }
      return parse(schema, answer)
    }

    return {
      listKey: presentFilters,

      list: async (filters, signal) => parse(listSchema, await requestPage(filters, signal)),

      page: async (filters, param, signal) => {
        const envelope = await requestPage(
          {
            ...filters,
            page: typeof param === 'number' ? param : 1,
            cursor: typeof param === 'string' ? param : undefined,
          },
          signal,
        )
        return isCursorShaped(envelope.meta)
          ? parse(cursorListSchema, envelope)
          : parse(listSchema, envelope)
      },

      get: readRecord,

      // Called on the source each time, so one written as a class keeps its `this`.
      ...(typeof source.create === 'function'
        ? {
            create: async (input: TCreate) =>
              writtenRecord(await run(() => source.create?.(input)), undefined),
          }
        : {}),
      ...(typeof source.update === 'function'
        ? {
            update: async (id: string, patch: TUpdate) =>
              writtenRecord(await run(() => source.update?.(id, patch)), id),
          }
        : {}),
      ...(typeof source.remove === 'function'
        ? {
            remove: async (id: string) => {
              await run(() => source.remove?.(id))
            },
          }
        : {}),
    }
  }

  // ─── The composables ──────────────────────────────────────────────────────

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

  function composables(backend: Backend<T, TFilters, TCreate, TUpdate>, scope: Scope) {
    const { ready } = scope
    const { create, update, remove } = backend

    function useList(filters: Ref<TFilters>): CollectionList<T> {
      const query = useQuery({
        queryKey: computed(() => scope.listKey(backend.listKey(filters.value))),
        queryFn: ({ signal }) => backend.list(filters.value, signal),
        // Hold the previous page while the next one loads. Without it every
        // filter keystroke empties the table and the layout jumps.
        placeholderData: (previous) => previous,
        staleTime: 30_000,
        ...(ready ? { enabled: computed(ready) } : {}),
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

    function useInfiniteList(filters: Ref<TFilters>): InfiniteList<T> {
      const query = useInfiniteQuery({
        // The page and the cursor are this query's own business: they are not
        // part of what it is cached under.
        queryKey: computed(() => [
          ...scope.listKey(
            backend.listKey({ ...filters.value, page: undefined, cursor: undefined }),
          ),
          'infinite',
        ]),
        queryFn: ({ pageParam, signal }) => backend.page(filters.value, pageParam, signal),
        initialPageParam: null as PageParam,
        getNextPageParam: (last: InfinitePage<T>) => nextPageParam(last),
        staleTime: 30_000,
        ...(ready ? { enabled: computed(ready) } : {}),
      })

      return {
        items: computed(() => query.data.value?.pages.flatMap((page) => page.data) ?? []),
        total: computed(() => query.data.value?.pages.at(-1)?.meta.total),
        hasMore: computed(() => query.hasNextPage.value),
        loadMore: () => {
          if (query.hasNextPage.value && !query.isFetchingNextPage.value) {
            void query.fetchNextPage()
          }
        },
        isPending: computed(() => query.isPending.value),
        isFetching: computed(() => query.isFetching.value),
        isLoadingMore: computed(() => query.isFetchingNextPage.value),
        isError: computed(() => query.isError.value),
        error: computed(() => query.error.value),
        refetch: () => void query.refetch(),
      }
    }

    function useDetail(id: MaybeRef<string | undefined>): CollectionDetail<T> {
      const query = useQuery({
        queryKey: computed(() => scope.detailKey(toValue(id) ?? '')),
        queryFn: ({ signal }) => backend.get(toValue(id) ?? '', signal),
        // Route params arrive before the component that reads them has mounted;
        // firing `/orders/undefined` produces a 404 the user briefly sees.
        enabled: computed(() => Boolean(toValue(id)) && (ready?.() ?? true)),
      })

      return {
        item: computed(() => query.data.value),
        isPending: computed(() => query.isPending.value),
        isError: computed(() => query.isError.value),
        error: computed(() => query.error.value),
        refetch: () => void query.refetch(),
      }
    }

    return {
      useList,
      useInfiniteList,
      useDetail,
      ...(create
        ? {
            useCreate: () =>
              useMutation<T, Error, TCreate>({
                mutationFn: (payload) => create(payload),
                onSettled: useInvalidate(),
              }),
          }
        : {}),
      ...(update
        ? {
            useUpdate: () =>
              useMutation<T, Error, { id: string; patch: TUpdate }>({
                mutationFn: ({ id, patch }) => update(id, patch),
                onSettled: useInvalidate(),
              }),
          }
        : {}),
      ...(remove
        ? {
            useRemove: () =>
              useMutation<void, Error, string>({
                mutationFn: (id) => remove(id),
                onSettled: useInvalidate(),
              }),
          }
        : {}),
    }
  }

  const rootScope: Scope = { listKey: keys.list, detailKey: keys.detail }

  if ('source' in config) return composables(sourceBackend(config.source), rootScope)

  /** The REST composables for one base path, plus the actions under it. */
  function restComposables(base: () => string, scope: Scope) {
    return {
      ...composables(restBackend(base), scope),
      action: <TInput, TOutput, TPath extends string | ((id: string) => string)>(
        actionConfig: CollectionActionConfig<TInput, TOutput, TPath>,
      ) =>
        defineAction(actionConfig, {
          resource,
          dialect,
          resolvePath: (target, spoken) =>
            target.startsWith('/') ? target : spoken.paths.action(`${base()}/${target}`),
          defaultInvalidates: [keys.all],
        }),
    }
  }

  const { path } = config
  const rootBase =
    typeof path === 'function'
      ? () => {
          throw new Error(
            `The "${resource}" collection is nested: its path needs its parent. ` +
              'Read it with `within(parent)`.',
          )
        }
      : () => path ?? `/${resource}`

  function within(parent: MaybeRefOrGetter<Record<string, unknown> | null | undefined>) {
    const complete = () => {
      const value = toValue(parent)
      return isCompleteParent(value) ? value : undefined
    }
    const base = () => {
      const value = complete()
      if (value === undefined) {
        throw new Error(`The "${resource}" collection was used before its parent was known.`)
      }
      return typeof path === 'function' ? path(encodedParent(value)) : `${rootBase()}`
    }
    // Cached per parent, and still under `keys.all`, so a write anywhere in
    // the collection invalidates every parent's lists.
    const scoped = (kind: string, last: unknown) => [...keys.all, 'within', complete(), kind, last]
    return restComposables(base, {
      listKey: (params) => scoped('list', params),
      detailKey: (id) => scoped('detail', id),
      ready: () => complete() !== undefined,
    })
  }

  return { ...restComposables(rootBase, rootScope), within }
}
