/**
 * Collection dialects: how a backend speaks "a list of things".
 *
 * `createCollectionApi` used to know one backend: `page`, `pageSize`,
 * `sortBy` and `sortOrder` in the query string, `{ data, meta }` in the
 * answer, `PATCH /{resource}/{id}` for an update. Spring counts pages from
 * zero and answers `{ content, totalElements }`; Django REST Framework sorts
 * with `ordering=-name` and answers `{ count, results }`; Laravel's paginator
 * says `per_page` and `last_page`. Every one of those meant editing the
 * collection factory, a file `vuestrata upgrade` replaces.
 *
 * A dialect is that knowledge, as data plus a few small pure functions:
 *
 *   query         what the list request's parameters are called, what the
 *                 first page is numbered, how a sort and an array are written
 *   parseList     where the rows and the totals are in the answer
 *   unwrapRecord  where the record is in a detail or a write's answer
 *   wrapRecord    what a write's body is wrapped in, if anything
 *   keys          whether field names change case on the way in and out
 *   updateMethod  PATCH or PUT
 *   paths         the list and record paths (a trailing slash, for one)
 *
 * The app's side never changes: filters are `page` (from 1), `pageSize`,
 * `search`, `sortBy`, `sortOrder`, and a list's meta is `{ total, page,
 * pageSize, totalPages }`. A dialect translates to and from that, so pages and
 * tables are written once whatever the backend.
 *
 * Which dialect a collection uses: the one its `createCollectionApi` call
 * names, else the project's (`collection`, or the `backend` preset, in
 * `app/config/api.overrides.ts`), else `vuestrataDialect`, which is the
 * behaviour this file replaced, unchanged.
 *
 * Framework-agnostic: no Vue, no TanStack. The factory that uses it is
 * `collection-queries.ts`.
 */
import { AppError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'

const dialectLogger = createScopedLogger('collection')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ─── Ids and paths ──────────────────────────────────────────────────────────

/** A request the collection layer refused to build. Nothing was sent. */
function refusedRequest(code: 'INVALID_ID' | 'INVALID_PATH', message: string): AppError {
  return new AppError({
    message,
    code,
    status: 400,
    kind: 'unknown',
    retryable: false,
    messageKey: 'errors.status_400',
  })
}

/**
 * An id as one path segment: `a/b` as `a%2Fb`, `x#1` as `x%231`.
 *
 * An id is data. It comes from a route parameter, a row, a response, and what
 * it holds is not the template's to interpret: written into a path as it is,
 * `../admin` climbs out of the collection, `x#f` cuts the path short (a
 * delete of a contact becomes a delete of its customer) and `x?y` moves the
 * rest of it into the query string. Encoded, it is one segment whatever it
 * holds, and an id that needs no encoding is sent exactly as before.
 *
 * Three values are refused, with an `AppError` (`INVALID_ID`) and before any
 * request: the empty string, which would address the collection itself, and
 * `.` and `..`, which encoding leaves alone and a URL parser resolves as
 * directories. Anything that is not text or a finite number is refused too.
 *
 * `what` names the value in the message (`id`, `parent id "customerId"`). The
 * value itself is never put in it.
 */
export function pathSegment(id: unknown, what = 'id'): string {
  const text =
    typeof id === 'string'
      ? id
      : typeof id === 'number' && Number.isFinite(id)
        ? String(id)
        : undefined
  if (text === undefined) {
    throw refusedRequest('INVALID_ID', `The ${what} is not usable: it must be text or a number.`)
  }
  if (text === '' || text === '.' || text === '..') {
    throw refusedRequest(
      'INVALID_ID',
      `The ${what} is not usable: it is ${text === '' ? 'empty' : 'a directory name, not a record'}.`,
    )
  }
  try {
    return encodeURIComponent(text)
  } catch {
    // A lone surrogate: half of a character, which no URL can carry.
    throw refusedRequest('INVALID_ID', `The ${what} is not usable: it is not valid text.`)
  }
}

/** A tab, a line break or another control character: a URL parser drops some of them. */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * An action's path, checked to be a path on the API and nothing else.
 *
 * The ids in it are already encoded (`pathSegment`), so what is refused here
 * is what a template wrote, or let through from something that was not an id:
 * a backslash (a browser reads it as a slash), a leading `//` (another host),
 * a `.` or `..` segment, spelled out or percent-encoded (out of the
 * collection, or out of the API prefix), and control characters (a URL parser
 * removes a tab or a line break, which can put two slashes side by side).
 * Refused with an `AppError` (`INVALID_PATH`), before any request.
 */
export function apiPath(path: string): string {
  const end = path.search(/[?#]/)
  const segments = (end === -1 ? path : path.slice(0, end)).split('/')
  const climbs = segments.some((segment) => {
    const plain = segment.replace(/%2e/gi, '.')
    return plain === '.' || plain === '..'
  })
  if (path.includes('\\') || path.startsWith('//') || climbs || hasControlCharacter(path)) {
    throw refusedRequest(
      'INVALID_PATH',
      'An action path must stay on the API: no "." or ".." segment, no backslash, ' +
        'no leading "//" and no control character.',
    )
  }
  return path
}

// ─── The list request ───────────────────────────────────────────────────────

/** Query parameters as the API client takes them: a list is a repeated parameter. */
export type CollectionQuery = Record<string, string | string[]>

/**
 * One column of a multi-column sort. A filter object carries them under
 * `sort`: `{ sort: [{ field: 'status' }, { field: 'createdAt', direction: 'desc' }] }`.
 * A syntax that can carry several (`field,dir`, `-field`, a function) sends
 * them all, in order, and then ignores `sortBy` and `sortOrder`.
 */
export interface CollectionSort {
  field: string
  direction?: 'asc' | 'desc'
}

/**
 * How a sort is written in the query string:
 *
 *   'sortBy+sortOrder'  two parameters, `sortBy=name&sortOrder=desc`. One
 *                       column only: a `sort` list is not read by this syntax
 *   'field,dir'         `sort=name,desc`, repeated per column (Spring)
 *   '-field'            `ordering=-name,createdAt`: a minus for descending,
 *                       columns joined by commas (DRF, JSON:API, Spatie)
 *   a function          returns the parameters itself, or `null` for none
 */
export type SortSyntax =
  | 'sortBy+sortOrder'
  | 'field,dir'
  | '-field'
  | ((terms: readonly Required<CollectionSort>[]) => CollectionQuery | null)

/**
 * How a filter holding a list is written:
 *
 *   'repeat'    `status=open&status=late`
 *   'comma'     `status=open,late`
 *   'brackets'  `status[]=open&status[]=late`
 *   'drop'      not sent at all: what the default dialect has always done
 *   a function  returns the parameters itself
 */
export type ArraySerialization =
  | 'repeat'
  | 'comma'
  | 'brackets'
  | 'drop'
  | ((values: string[], param: string) => CollectionQuery)

/**
 * Turns one filter into parameters: `{ from, to }` into `created_after` and
 * `created_before`, say. Returns the parameters by name, or nothing to send
 * none. The values it returns are written like any other filter's: a `Date`
 * as an ISO string, a list by the dialect's `arrays` rule, an empty one not
 * at all.
 */
export type FilterSerializer = (
  value: unknown,
  param: string,
) => Record<string, unknown> | null | undefined

/** What a dialect says about the list request. Every field has a default. */
export interface CollectionQueryConventions {
  /** The parameter that carries the page number, or the offset under `paging: 'offset'`. */
  page: string
  /** The parameter that carries the page size. */
  pageSize: string
  /** The parameter that carries the search term. */
  search: string
  /** The parameter that carries the cursor, under `paging: 'cursor'`. */
  cursor: string
  /**
   * `page` sends a page number; `offset` sends `(page - 1) * pageSize` in its
   * place; `cursor` sends neither, and the list is read with
   * `useInfiniteList`, which passes the cursor along.
   */
  paging: 'page' | 'offset' | 'cursor'
  /** What the backend calls the first page. The app always calls it 1. */
  pageBase: 0 | 1
  sort: SortSyntax
  /** The sort parameter; for `sortBy+sortOrder`, the one that names the column. */
  sortParam: string
  /** For `sortBy+sortOrder` only: the parameter that carries `asc` or `desc`. */
  sortOrderParam: string
  arrays: ArraySerialization
  /**
   * What becomes of a filter holding an object, such as a range. A serializer
   * writes it; `'drop'` does not send it, silently, which is the default
   * dialect's legacy and covers a `Date` too. Left out, such a filter is
   * `unserializable`.
   */
  objects?: 'drop' | FilterSerializer
  /** Serializers by filter name, for the ones a general rule cannot cover. */
  serialize?: Readonly<Record<string, FilterSerializer>>
  /**
   * The parameter a domain filter is sent as: `status` as `filter.status`.
   * Given the name in the backend's case when `keys` is set
   * (`account_manager`), and defaults to exactly that.
   */
  filterName?: (name: string) => string
  /** The name a sort column is sent as. Given and defaulted like `filterName`. */
  sortField?: (field: string) => string
  /**
   * What to do with a filter that cannot be written: an object with no
   * serializer, a list of objects, an offset without a page size, or a filter
   * whose name on the wire is one of the dialect's own parameters (`size`
   * under Spring, `per_page` under Laravel, `ordering` under DRF: the
   * dialect's parameter is sent, the filter is not). `error` fails the list
   * with an `AppError` (`UNSERIALIZABLE_FILTER`) that names the filter, and
   * sends nothing; `warn` logs once per filter and sends the request without
   * it; `drop` says nothing.
   *
   * The default is `error` in development and `warn` in a production build. A
   * filter that silently is not sent returns rows the user did not ask for,
   * so it should not survive development; and a production page should not
   * go down for it.
   */
  unserializable: 'error' | 'warn' | 'drop'
}

// ─── The list response ──────────────────────────────────────────────────────

/** What `parseList` is told about the request the answer belongs to. */
export interface ListContext {
  /** The filters the list was asked for, as the app wrote them. */
  readonly filters: Readonly<Record<string, unknown>>
  /** The page that was asked for, counted from 1; 1 when the filters name none. */
  readonly page: number
  /** The page size that was asked for, when the filters name one. */
  readonly pageSize: number | undefined
  /** The response's headers, for a backend that paginates in `Link` or `X-Total-Count`. */
  readonly headers: Headers | undefined
}

/**
 * What a dialect found in a list response. Neither part is trusted: the
 * factory validates the rows against the collection's schema and `meta`
 * against the app's shape, so a dialect passes on what it read and lets a
 * wrong value fail there, with a path.
 *
 * `meta` is `{ total, page, pageSize, totalPages }`, `page` counted from 1.
 * Under `paging: 'cursor'` it is `{ nextCursor, prevCursor, hasMore }` with
 * `total` and `pageSize` optional.
 */
export interface ParsedList {
  items: unknown
  meta: unknown
}

/** What `wrapRecord` is told about the write. */
export interface RecordWriteContext {
  readonly operation: 'create' | 'update'
  readonly resource: string
  /** The record being updated. Absent for a create. */
  readonly id?: string
}

/**
 * The list and record paths, from the collection's base path (`/orders`).
 *
 * `detail` is given the id already encoded as one path segment (see
 * `pathSegment`): a template writes it where it belongs and cannot get the
 * escaping wrong.
 */
export interface CollectionPaths {
  list: (base: string) => string
  detail: (base: string, id: string) => string
  /**
   * The last word on the path of an action that continues the collection's
   * own (`/orders/7/cancel`): DRF adds its trailing slash here. Given the
   * whole path, query string included if the action wrote one. An action
   * whose path starts from the API root is sent as it was written.
   */
  action?: (path: string) => string
}

// ─── Keys ───────────────────────────────────────────────────────────────────

/**
 * Renaming keys between the backend's case and the app's camelCase.
 *
 * On the way in, list rows and records are renamed before the schema sees
 * them, so the schema, the types and every error path are in camelCase. On the
 * way out, a write's body, the names of domain filters and sort columns are
 * renamed to `wire`. `AppError.details` is never renamed: it carries the
 * backend's own field paths, which the form layer maps.
 *
 * It is an opt-in, not a default, because renaming deep is a guess about every
 * object in the payload, and the guess is wrong for a dictionary: in
 * `{ "prices": { "eur_cents": 1200 } }`, `eur_cents` is data. Two lists say
 * where the guess does not apply, as dot paths in the app's case with `*` for
 * "every element" or "every key":
 *
 *   opaque        left exactly as sent, however deep: a settings bag, a JSON
 *                 column, a payload the app only passes on
 *   dictionaries  the keys at this level are data and stay; the values under
 *                 them are records like any other
 *
 * The factory fills both from the collection's schema where the schema says
 * so: a `z.record()` is a dictionary (opaque when its values are not objects),
 * a `z.unknown()` or `z.any()` field is opaque. It follows objects, arrays,
 * optional and nullable wrappers, `z.preprocess()` and unions, and stops at a
 * recursive schema. List here what it cannot see.
 *
 * `names` is for a name the case rule gets wrong, which it does for digits
 * and for acronyms, because neither case says where a word ends:
 *
 *   digits    `address_line_1` is read as `addressLine1`, which goes back out
 *             as `address_line1`: a write the backend ignores
 *   acronyms  a schema field `userID` is sent as `user_id`, which is read
 *             back as `userId`: the schema's `userID` never arrives, and an
 *             optional field is then missing without an error. The same for
 *             `homeURL` and `is2FAEnabled`. Under `wire: 'pascal'`, `URL` and
 *             `HTTPStatus` are read as `url` and `httpStatus` and go back out
 *             as `Url` and `HttpStatus`
 *
 * One entry, app name to backend name, fixes both directions:
 *
 *     names: { addressLine1: 'address_line_1', userID: 'user_id', url: 'URL' }
 *
 * The collection layer says which entries are needed. In development it warns,
 * once per key and with the entry to add, about a schema field that does not
 * come back from the wire as itself, and about a response key that would not
 * be written back as it was read. It also warns, in any build, when two keys
 * of one object are read as the same name (`user_id` and `userId` both
 * present): the last one wins, and the other value is lost.
 */
export interface KeyTransform {
  /** The backend's case: what a request body's keys are renamed to. */
  wire: 'snake' | 'pascal'
  /** App name to backend name, for the irregular ones. Applied in both directions. */
  names?: Readonly<Record<string, string>>
  opaque?: readonly string[]
  dictionaries?: readonly string[]
}

/**
 * `'preserve'` leaves every key as it is. `'camel'` is `{ wire: 'snake' }`:
 * camelCase in the app, snake_case on the wire.
 */
export type CollectionKeys = 'preserve' | 'camel' | KeyTransform

/**
 * Where renaming does not apply: see `KeyTransform`. The empty path (`''`) is
 * the payload itself: a schema that is a `z.record()` from the top.
 */
export interface KeyPlan {
  readonly opaque: readonly string[]
  readonly dictionaries: readonly string[]
  /**
   * Every field name the schema declares, at any depth. What the factory
   * checks the case rule against, once: see `unstableKey`.
   */
  readonly fields?: readonly string[]
}

// ─── The dialect ────────────────────────────────────────────────────────────

/**
 * How one backend speaks. Only `name` and `parseList` are required: everything
 * else defaults to the plainest convention (parameters named as the app names
 * them, the record as the whole body, keys untouched, PATCH, `/{base}/{id}`).
 */
export interface CollectionDialect {
  /** For log lines and error messages. */
  readonly name: string
  /** The list request's conventions. Each field left out keeps its default. */
  readonly query?: Partial<CollectionQueryConventions>
  /**
   * Build the list request's parameters yourself, when `query` cannot
   * describe them. Replaces `query` altogether except for `paging`, which
   * still says whether the list is read by page or by cursor.
   */
  readonly toListQuery?: (filters: Readonly<Record<string, unknown>>) => CollectionQuery
  /**
   * Find the rows and the totals in a list response. Returns `null` when the
   * body is not this dialect's envelope at all, which fails the list as a
   * contract mismatch.
   */
  readonly parseList: (raw: unknown, context: ListContext) => ParsedList | null
  /** Find the record in a detail or a write's response. Defaults to the body itself. */
  readonly unwrapRecord?: (raw: unknown) => unknown
  /** Wrap a write's body, after its keys were renamed. Defaults to the body itself. */
  readonly wrapRecord?: (body: unknown, context: RecordWriteContext) => unknown
  readonly keys?: CollectionKeys
  /**
   * The method an update is sent with. `PUT` replaces the record, so the
   * caller must then pass all of it as the patch.
   */
  readonly updateMethod?: 'PATCH' | 'PUT'
  readonly paths?: Partial<CollectionPaths>
  /**
   * Whether a failed list request is this backend's way of saying that the
   * page asked for is past the last one, where others answer with an empty
   * page. DRF's `PageNumberPagination` answers 404.
   *
   * It is only asked about a page after the first, and its yes is checked:
   * the collection reads the first page, and shows the empty page only if
   * that proves the one asked for does not exist. So answering by the status
   * alone is safe, and the body, which a backend localizes, need not be read.
   */
  readonly isPastLastPage?: (error: AppError) => boolean
}

/**
 * A dialect with every default filled in: what the factory works with. Made
 * by `resolveCollectionDialect`. To change a dialect, change its `spec` and
 * resolve again; spreading a resolved one would keep functions built from the
 * old conventions.
 */
export interface ResolvedCollectionDialect {
  /** What this was resolved from. */
  readonly spec: CollectionDialect
  readonly name: string
  readonly query: CollectionQueryConventions
  readonly toListQuery: (filters: Readonly<Record<string, unknown>>) => CollectionQuery
  /**
   * What a list with these filters is cached under: the parameters
   * `toListQuery` would send, built without throwing and without logging. A
   * cache key is computed where the list is declared, in a component's
   * `setup` and again whenever the filters change, and a throw there takes
   * the component down. The request is where a filter that cannot be written
   * is raised, so the list fails with a message instead.
   */
  readonly listKey: (filters: Readonly<Record<string, unknown>>) => Record<string, unknown>
  readonly parseList: (raw: unknown, context: ListContext) => ParsedList | null
  readonly unwrapRecord: (raw: unknown) => unknown
  readonly wrapRecord: (body: unknown, context: RecordWriteContext) => unknown
  /** `null` for `'preserve'`. */
  readonly keys: KeyTransform | null
  readonly updateMethod: 'PATCH' | 'PUT'
  readonly isPastLastPage?: (error: AppError) => boolean
  /**
   * `detail` takes the id as the app has it and encodes it (`pathSegment`),
   * whatever the dialect: it throws an `AppError` for an id no path can hold.
   */
  readonly paths: Required<CollectionPaths>
}

/**
 * Declare a dialect. An identity function: it exists so a dialect written in
 * a project is type-checked against `CollectionDialect` where it is written.
 */
export function defineCollectionDialect(dialect: CollectionDialect): CollectionDialect {
  return dialect
}

/**
 * A dialect with some of it changed. `query` and `paths` are merged field by
 * field, so one convention can be changed without restating the rest:
 *
 *     extendDialect(dialects.drf, { keys: 'camel', query: { arrays: 'comma' } })
 */
export function extendDialect(
  base: CollectionDialect,
  changes: Partial<CollectionDialect>,
): CollectionDialect {
  return {
    ...base,
    ...changes,
    query: { ...base.query, ...changes.query },
    paths: { ...base.paths, ...changes.paths },
  }
}

function identity<T>(value: T): T {
  return value
}

const DEFAULT_PATHS: Required<CollectionPaths> = {
  list: (base) => base,
  detail: (base, id) => `${base}/${id}`,
  action: identity,
}

/**
 * A dialect's paths, with the id encoded before its template sees it. Done
 * here, once, for every dialect: the shipped ones and a project's own.
 */
function resolvePaths(paths: Partial<CollectionPaths> | undefined): Required<CollectionPaths> {
  const { list, detail, action } = { ...DEFAULT_PATHS, ...paths }
  return { list, detail: (base, id) => detail(base, pathSegment(id)), action }
}

function resolveKeys(keys: CollectionKeys | undefined): KeyTransform | null {
  if (keys === undefined || keys === 'preserve') return null
  if (keys === 'camel') return { wire: 'snake' }
  return keys
}

/**
 * Fill in a dialect's defaults. Throws on something that is not a dialect: a
 * collection layer that silently fell back to another backend's conventions
 * would fail every list with a schema error that points nowhere near the
 * cause.
 */
export function resolveCollectionDialect(
  dialect: CollectionDialect | ResolvedCollectionDialect,
): ResolvedCollectionDialect {
  // Typed as a dialect, and still checked: it arrives from a project's file.
  const given = dialect as CollectionDialect | ResolvedCollectionDialect | null | undefined
  if (typeof given !== 'object' || given === null || typeof given.parseList !== 'function') {
    throw new TypeError(
      'Not a collection dialect: expected an object with a `name` and a `parseList` function, ' +
        'such as one of the `dialects` in `core/lib/api/dialects`.',
    )
  }
  if ('spec' in given) return given

  const name = typeof given.name === 'string' && given.name !== '' ? given.name : 'custom'
  const keys = resolveKeys(given.keys)
  const query = resolveConventions(given.query)
  const ownQuery = given.toListQuery

  /** The filters already warned about: a table refetches on every keystroke. */
  const warned = new Set<string>()

  /** What the conventions' `unserializable` says to do about a filter that was not written. */
  function raise(refused: readonly RefusedFilter[]): void {
    if (query.unserializable === 'drop') return
    for (const { name: filter, why } of refused) {
      const message =
        `The "${name}" collection dialect cannot send the filter "${filter}": ${why}. ` +
        'Give the dialect a serializer for it (`query.serialize` or `query.objects`), ' +
        'or leave it out of the filters.'
      if (query.unserializable === 'error') {
        // No `messageKey`: this is for the developer, and the list's error
        // state should say exactly this.
        throw new AppError({
          message,
          code: 'UNSERIALIZABLE_FILTER',
          status: 400,
          kind: 'unknown',
          retryable: false,
        })
      }
      if (!warned.has(filter)) {
        warned.add(filter)
        dialectLogger.warn(message)
      }
    }
  }

  return {
    spec: given,
    name,
    query,
    toListQuery:
      ownQuery ??
      ((filters) => {
        const built = buildListQuery(filters, query, keys)
        raise(built.refused)
        return built.query
      }),
    listKey(filters) {
      if (ownQuery) {
        try {
          return ownQuery(filters)
        } catch {
          // The request will throw the same, where a query can show it. The
          // key only has to tell this list from the others.
          return { unserializable: true, filters }
        }
      }
      const built = buildListQuery(filters, query, keys)
      return built.refused.length === 0 || query.unserializable === 'drop'
        ? built.query
        : // Its own entry: fixing the filter must not find the failure cached.
          { ...built.query, '!refused': built.refused.map((filter) => filter.name) }
    },
    parseList: given.parseList,
    unwrapRecord: given.unwrapRecord ?? identity,
    wrapRecord: given.wrapRecord ?? identity,
    keys,
    updateMethod: given.updateMethod === 'PUT' ? 'PUT' : 'PATCH',
    ...(typeof given.isPastLastPage === 'function' ? { isPastLastPage: given.isPastLastPage } : {}),
    paths: resolvePaths(given.paths),
  }
}

/**
 * The query parameters a dialect sends for a filter object.
 *
 * Whatever the dialect, `undefined`, `null`, `''` and `'all'` are dropped:
 * sending `role=` or `role=all` to a backend that filters on exact match
 * returns zero rows, which reads to the user as "no results" when they have
 * in fact just cleared the filter.
 */
export function toCollectionParams(
  filters: object,
  dialect: CollectionDialect | ResolvedCollectionDialect,
): CollectionQuery {
  return resolveCollectionDialect(dialect).toListQuery(filters as Record<string, unknown>)
}

/** What `parseList` is told, from the filters a list was asked for. */
export function listContext(filters: object, headers?: Headers): ListContext {
  const record = filters as Record<string, unknown>
  const page = Number(record.page)
  const pageSize = Number(record.pageSize)
  return {
    filters: record,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : undefined,
    headers,
  }
}

// ─── Building the list request ──────────────────────────────────────────────

function resolveConventions(
  query: Partial<CollectionQueryConventions> | undefined,
): CollectionQueryConventions {
  const sort = query?.sort ?? 'sortBy+sortOrder'
  return {
    page: 'page',
    pageSize: 'pageSize',
    search: 'search',
    cursor: 'cursor',
    paging: 'page',
    pageBase: 1,
    sortParam: sort === 'sortBy+sortOrder' ? 'sortBy' : 'sort',
    sortOrderParam: 'sortOrder',
    arrays: 'repeat',
    unserializable: import.meta.env.DEV ? 'error' : 'warn',
    ...query,
    sort,
  }
}

/** A cleared filter: see `toCollectionParams`. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === 'all'
}

function isSortList(value: unknown): value is CollectionSort[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((term) => isRecord(term) && typeof term.field === 'string' && term.field !== '')
  )
}

/** A value the query string can carry as is. Anything that is not an object. */
function scalar(value: unknown): string {
  return typeof value === 'string' ? value : String(value as number | boolean)
}

/** Marks a filter the conventions have no way to write. */
const UNSERIALIZABLE = Symbol('unserializable')

/** A filter the conventions did not write, and why. */
interface RefusedFilter {
  name: string
  why: string
}

/** The sort the filters ask for, in the app's names. */
function sortTerms(filters: Readonly<Record<string, unknown>>): Required<CollectionSort>[] {
  if (isSortList(filters.sort)) {
    return filters.sort.map((term) => ({
      field: term.field,
      direction: term.direction === 'desc' ? 'desc' : 'asc',
    }))
  }
  if (isBlank(filters.sortBy) || typeof filters.sortBy === 'object') return []
  return [
    { field: scalar(filters.sortBy), direction: filters.sortOrder === 'desc' ? 'desc' : 'asc' },
  ]
}

/**
 * The list request's parameters, and the filters that could not be written.
 * Never throws and never logs: what to make of a refusal is the caller's
 * business (`resolveCollectionDialect`), since the cache key is built from the
 * same parameters and must not fail the component that asked for it.
 */
function buildListQuery(
  filters: Readonly<Record<string, unknown>>,
  conventions: CollectionQueryConventions,
  keys: KeyTransform | null,
): { query: CollectionQuery; refused: RefusedFilter[] } {
  const query: CollectionQuery = {}
  const refused: RefusedFilter[] = []
  const twoParamSort = conventions.sort === 'sortBy+sortOrder'
  const wireName = (name: string) => (keys ? toWireKey(name, keys) : name)
  // The backend's case first: a dialect's own naming is given the name as the
  // backend spells it, so `filter.account_manager` and not `filter.accountManager`.
  const named = (rename: ((name: string) => string) | undefined) =>
    rename ? (name: string) => rename(wireName(name)) : wireName
  const filterName = named(conventions.filterName)
  const sortField = named(conventions.sortField)

  /** The sort's own parameters: `null` under the two-parameter syntax, or with no sort. */
  const sortParams = ((): CollectionQuery | null => {
    if (twoParamSort) return null
    const terms = sortTerms(filters).map((term) => ({ ...term, field: sortField(term.field) }))
    if (terms.length === 0) return null
    if (typeof conventions.sort === 'function') return conventions.sort(terms)
    return {
      [conventions.sortParam]:
        conventions.sort === 'field,dir'
          ? terms.map((term) => `${term.field},${term.direction}`)
          : terms
              .map((term) => (term.direction === 'desc' ? `-${term.field}` : term.field))
              .join(','),
    }
  })()

  /**
   * The parameters that are the dialect's own. A domain filter that would be
   * sent under one of these names is not sent: `size` under Spring would
   * replace the page size, `ordering` under DRF the sort. The dialect's
   * parameter wins, and the filter is refused like any other it cannot write.
   */
  const reserved = new Map<string, string>([
    conventions.paging === 'cursor'
      ? [conventions.cursor, 'cursor']
      : [conventions.page, conventions.paging === 'offset' ? 'offset' : 'page'],
    [conventions.pageSize, 'page size'],
    [conventions.search, 'search'],
  ])
  if (twoParamSort) reserved.set(conventions.sortOrderParam, 'sort')
  if (typeof conventions.sort !== 'function') reserved.set(conventions.sortParam, 'sort')
  for (const param of Object.keys(sortParams ?? {})) reserved.set(param, 'sort')

  function refuse(name: string, why: string): void {
    refused.push({ name, why })
  }

  /** Write one parameter of a domain filter, unless the name is the dialect's own. */
  function put(name: string, param: string, value: string | string[]): void {
    const taken = reserved.get(param)
    if (taken === undefined) query[param] = value
    else refuse(name, `it would be sent as "${param}", which is this dialect's ${taken} parameter`)
  }

  /** One value as text, or `UNSERIALIZABLE`. `null` for a value to leave out. */
  function text(value: unknown): string | null | typeof UNSERIALIZABLE {
    if (isBlank(value)) return null
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? UNSERIALIZABLE : value.toISOString()
    }
    return typeof value === 'object' ? UNSERIALIZABLE : scalar(value)
  }

  function writeArray(name: string, param: string, values: unknown[]): void {
    if (conventions.arrays === 'drop') return
    const texts: string[] = []
    for (const value of values) {
      const written = text(value)
      if (written === UNSERIALIZABLE) return refuse(name, 'it is a list holding an object')
      if (written !== null) texts.push(written)
    }
    // A multi-select with nothing selected is a cleared filter.
    if (texts.length === 0) return

    if (typeof conventions.arrays === 'function') {
      for (const [key, value] of Object.entries(conventions.arrays(texts, param))) {
        put(name, key, value)
      }
    } else if (conventions.arrays === 'comma') {
      put(name, param, texts.join(','))
    } else if (conventions.arrays === 'brackets') {
      put(name, `${param}[]`, texts)
    } else {
      put(name, param, texts)
    }
  }

  /** Write the parameters a serializer returned. They are not serialized again. */
  function writeSerialized(name: string, serialized: Record<string, unknown>): void {
    for (const [param, value] of Object.entries(serialized)) {
      if (Array.isArray(value)) {
        writeArray(name, param, value)
        continue
      }
      const written = text(value)
      if (written === UNSERIALIZABLE)
        refuse(name, `its serializer returned an object for "${param}"`)
      else if (written !== null) put(name, param, written)
    }
  }

  function writeFilter(name: string, value: unknown): void {
    const own = conventions.serialize
    if (own && Object.hasOwn(own, name)) {
      const serialized = own[name]!(value, filterName(name))
      if (isRecord(serialized)) writeSerialized(name, serialized)
      return
    }

    const param = filterName(name)
    if (Array.isArray(value)) return writeArray(name, param, value)

    if (typeof value === 'object' && value !== null) {
      // The default dialect's legacy: whatever is not a scalar is not sent.
      if (conventions.objects === 'drop') return
      if (!(value instanceof Date)) {
        const serialized =
          typeof conventions.objects === 'function' ? conventions.objects(value, param) : undefined
        if (isRecord(serialized)) return writeSerialized(name, serialized)
        return refuse(name, 'it is an object, and the dialect has no rule for objects')
      }
    }

    const written = text(value)
    if (written === UNSERIALIZABLE) refuse(name, 'it is not a valid date')
    else if (written !== null) put(name, param, written)
  }

  function writePage(value: unknown): void {
    if (conventions.paging === 'cursor') return
    const page =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN
    if (conventions.paging === 'offset') {
      const pageSize = Number(filters.pageSize)
      if (Number.isFinite(page) && Number.isFinite(pageSize)) {
        query[conventions.page] = String(Math.max(0, page - 1) * pageSize)
      } else if (page !== 1) {
        refuse('page', 'an offset needs a numeric page and pageSize')
      }
      return
    }
    // A page below the first is the first: Spring would be asked for `page=-1`.
    query[conventions.page] =
      conventions.pageBase === 0 && Number.isFinite(page)
        ? String(Math.max(0, page - 1))
        : scalar(value)
  }

  /** The sort, once, at the place the first sort key had in the filters. */
  const sortWritten = { done: false }
  function writeSort(): void {
    if (sortWritten.done) return
    sortWritten.done = true
    Object.assign(query, sortParams)
  }

  for (const [name, value] of Object.entries(filters)) {
    if (isBlank(value)) continue

    const ownName =
      name === 'page' ||
      name === 'pageSize' ||
      name === 'search' ||
      (name === 'cursor' && conventions.paging === 'cursor')
    if (ownName && typeof value === 'object') {
      // `String({})` would send `[object Object]`, which no backend can read.
      refuse(name, 'it must be text or a number')
    } else if (name === 'page') writePage(value)
    else if (name === 'pageSize') query[conventions.pageSize] = scalar(value)
    else if (name === 'search') query[conventions.search] = scalar(value)
    else if (name === 'cursor' && conventions.paging === 'cursor') {
      query[conventions.cursor] = scalar(value)
    } else if (twoParamSort && name === 'sortBy' && typeof value !== 'object') {
      query[conventions.sortParam] = sortField(scalar(value))
    } else if (twoParamSort && name === 'sortOrder' && typeof value !== 'object') {
      query[conventions.sortOrderParam] = scalar(value)
    } else if (!twoParamSort && (name === 'sortBy' || name === 'sortOrder')) {
      writeSort()
    } else if (!twoParamSort && name === 'sort' && isSortList(value)) {
      writeSort()
    } else {
      writeFilter(name, value)
    }
  }

  return { query, refused }
}

/**
 * An object filter as bracketed parameters, however deep:
 * `{ from, to }` under `created` becomes `created[from]` and `created[to]`.
 * What PHP, Rails and `qs` read back as a nested value.
 */
export const bracketFilter: FilterSerializer = (value, param) =>
  flattenFilter(value, param, '[', ']')

/**
 * An object filter as joined parameters: `flatFilter('.')` writes `{ from, to }`
 * under `created` as `created.from` and `created.to`, which is how Spring binds
 * a nested property; `flatFilter('_')` writes `created_from` and `created_to`.
 */
export function flatFilter(separator: string): FilterSerializer {
  return (value, param) => flattenFilter(value, param, separator, '')
}

function flattenFilter(
  value: unknown,
  param: string,
  open: string,
  close: string,
  depth = 0,
): Record<string, unknown> | null {
  if (!isRecord(value) || value instanceof Date) return null
  const out: [string, unknown][] = []
  for (const [key, child] of Object.entries(value)) {
    const name = `${param}${open}${key}${close}`
    // Eight levels is far past any filter and well short of the stack.
    const nested =
      depth < 8 && isRecord(child) && !(child instanceof Date)
        ? flattenFilter(child, name, open, close, depth + 1)
        : null
    if (nested) out.push(...Object.entries(nested))
    else out.push([name, child])
  }
  return Object.fromEntries(out)
}

// ─── Reading list responses ─────────────────────────────────────────────────

/**
 * `"15"` as 15. Laravel echoes `per_page` as the string the request gave it
 * when a controller passes it straight to `paginate()`.
 */
function count(value: unknown): unknown {
  return typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * The app's page meta from what a backend reports.
 *
 * `totalPages` is worked out from the total when the backend does not send
 * it, and is never less than 1, whether worked out or reported: an empty list
 * has one (empty) page. Spring reports 0 for it, Laravel 1, DRF nothing, and
 * a pager showing "page 1 of 0" for one backend and "1 of 1" for another is a
 * difference no page should have to handle. Every shipped dialect but the
 * default goes through here, and so does a source that answers `{ items,
 * total }`. The default dialect does not: `vuestrataDialect` passes `meta` on
 * exactly as the backend sent it, a `totalPages` of 0 included, because that
 * is what it has always done. A dialect of your own that should agree with
 * the others calls this.
 *
 * A value that is not a number is passed on as it is, to fail validation
 * under its own name instead of being papered over here.
 */
export function pageMetaOf(reported: {
  total: unknown
  page: unknown
  pageSize: unknown
  totalPages?: unknown
}): { total: unknown; page: unknown; pageSize: unknown; totalPages: unknown } {
  const total = count(reported.total)
  const pageSize = count(reported.pageSize)
  const totalPages = count(reported.totalPages)

  return {
    total,
    page: count(reported.page),
    pageSize,
    totalPages: isCount(totalPages)
      ? Math.max(1, totalPages)
      : totalPages === undefined || totalPages === null
        ? isCount(total) && isCount(pageSize) && pageSize > 0
          ? Math.max(1, Math.ceil(total / pageSize))
          : undefined
        : totalPages,
  }
}

/**
 * The size of the pages a backend is serving, when its answer does not say.
 *
 * What was asked for is not reliable: a backend caps it, or ignores it. A
 * full page (one with a next page) shows the size outright; a last page shows
 * it through the rows before it, when the total is known; only a list that
 * fits on its first page has to take the request's word, or its own length.
 */
function servedPageSize(
  total: unknown,
  length: number,
  hasNext: boolean,
  context: ListContext,
): number {
  if (hasNext && length > 0) return length
  if (context.page > 1 && isCount(total)) {
    const size = (total - length) / (context.page - 1)
    if (Number.isInteger(size) && size > 0) return size
  }
  return context.pageSize ?? Math.max(length, 1)
}

/** A cursor as the app carries it: a string, or `null` for none. */
function cursorOf(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null
}

/** The `cursor` parameter of a link such as DRF's `next`, or `null`. */
function cursorInLink(link: unknown, param: string): string | null {
  if (typeof link !== 'string' || link === '') return null
  try {
    return cursorOf(new URL(link, 'http://localhost').searchParams.get(param))
  } catch {
    return null
  }
}

/**
 * The record inside a `{ data: {…} }` envelope, or the body itself when it is
 * not one.
 *
 * Told apart by the top-level `id`: a body with a `data` object and no `id`
 * of its own is an envelope; one that has an `id` is a record that happens to
 * have a field called `data`, and is left alone. A record keyed by something
 * other than `id` that also has a `data` object needs a dialect that says so
 * (`unwrapRecord: (raw) => raw`).
 */
export function unwrapData(raw: unknown): unknown {
  if (!isRecord(raw) || !isRecord(raw.data)) return raw
  return Object.hasOwn(raw, 'id') ? raw : raw.data
}

// ─── The shipped dialects ───────────────────────────────────────────────────
//
// Each is a plain object, declared on its own, so a build that names none of
// them carries none of them: only `vuestrataDialect` is always in the bundle.

/**
 * Vuestrata's own contract, and the default.
 *
 *   request   `page` (from 1), `pageSize`, `search`, `sortBy`, `sortOrder`,
 *             and each scalar filter under its own name. A filter holding a
 *             list or an object is not sent
 *   list      `{ data: [...], meta: { total, page, pageSize, totalPages } }`
 *   record    the body itself
 *   update    `PATCH /{resource}/{id}`
 *
 * Exactly what `createCollectionApi` did before dialects existed, the silent
 * drop of lists and objects included: a project that never names a dialect
 * sends and reads what it always has. To send lists under this contract,
 * extend it: `extendDialect(dialects.vuestrata, { query: { arrays: 'repeat' } })`.
 */
export const vuestrataDialect: CollectionDialect = {
  name: 'vuestrata',
  query: {
    page: 'page',
    pageSize: 'pageSize',
    search: 'search',
    sort: 'sortBy+sortOrder',
    arrays: 'drop',
    objects: 'drop',
    unserializable: 'drop',
  },
  parseList: (raw) => (isRecord(raw) ? { items: raw.data, meta: raw.meta } : null),
}

/**
 * Laravel's paginator.
 *
 *   request   `page` (from 1), `per_page`, `search`, `sort=-name,created_at`,
 *             lists as `status[]=a&status[]=b`, objects as `range[from]=…`
 *   list      an API Resource collection
 *             `{ data, links, meta: { current_page, per_page, last_page, total } }`
 *             or `paginate()` returned as is, with the same four at the top
 *   record    `{ data: {…} }` from an API Resource, or the bare model
 *   update    `PATCH /{resource}/{id}`
 *
 * Only `page` is read by Laravel itself. `per_page`, `search`, the sort and
 * the filters are what a controller has to read (`sort` and bracketed filters
 * are what `spatie/laravel-query-builder` expects, with `filterName` set to
 * `(name) => \`filter[${name}]\``).
 *
 * Laravel answers in snake_case unless its resources rename: add
 * `keys: 'camel'` with `extendDialect` to work in camelCase.
 */
export const laravelDialect: CollectionDialect = {
  name: 'laravel',
  query: {
    page: 'page',
    pageSize: 'per_page',
    search: 'search',
    sort: '-field',
    sortParam: 'sort',
    arrays: 'brackets',
    objects: bracketFilter,
  },
  parseList(raw) {
    if (!isRecord(raw)) return null
    const meta = isRecord(raw.meta) && 'current_page' in raw.meta ? raw.meta : raw
    return {
      items: raw.data,
      meta: pageMetaOf({
        total: meta.total,
        page: meta.current_page,
        pageSize: meta.per_page,
        totalPages: meta.last_page,
      }),
    }
  },
  unwrapRecord: unwrapData,
}

/**
 * Laravel's `cursorPaginate()`: `{ data, next_cursor, prev_cursor, per_page }`,
 * at the top or under `meta`, and the cursor sent back as `cursor`. Read with
 * `useInfiniteList`.
 */
export const laravelCursorDialect: CollectionDialect = {
  name: 'laravel-cursor',
  // Written out, not spread from `laravelDialect`: a spread at module scope is
  // a side effect to a bundler, and would keep both in every build.
  query: {
    paging: 'cursor',
    cursor: 'cursor',
    pageSize: 'per_page',
    search: 'search',
    sort: '-field',
    sortParam: 'sort',
    arrays: 'brackets',
    objects: bracketFilter,
  },
  unwrapRecord: unwrapData,
  parseList(raw) {
    if (!isRecord(raw)) return null
    const meta = isRecord(raw.meta) && 'next_cursor' in raw.meta ? raw.meta : raw
    const nextCursor = cursorOf(meta.next_cursor)
    const pageSize = count(meta.per_page)
    return {
      items: raw.data,
      meta: {
        nextCursor,
        prevCursor: cursorOf(meta.prev_cursor),
        hasMore: nextCursor !== null,
        ...(isCount(pageSize) && pageSize > 0 ? { pageSize } : {}),
      },
    }
  },
}

// The three DRF paginations share their search, ordering and list parameters.
// Each writes them out: see the note in `laravelCursorDialect`.

/**
 * DRF's trailing slash. On an action too: Django's `APPEND_SLASH` answers a
 * path without it with a redirect, which a POST cannot follow with its body.
 */
const DRF_PATHS: CollectionPaths = {
  list: (base) => `${base}/`,
  detail: (base, id) => `${base}/${id}/`,
  action(path) {
    const end = path.search(/[?#]/)
    const route = end === -1 ? path : path.slice(0, end)
    return route.endsWith('/') ? path : `${route}/${path.slice(route.length)}`
  },
}

function parseDrfPage(raw: unknown, context: ListContext): ParsedList | null {
  if (!isRecord(raw)) return null
  const total = count(raw.count)
  const length = Array.isArray(raw.results) ? raw.results.length : 0
  const hasNext = raw.next !== null && raw.next !== undefined
  return {
    items: raw.results,
    meta: pageMetaOf({
      total,
      page: context.page,
      pageSize: servedPageSize(total, length, hasNext, context),
    }),
  }
}

/**
 * Django REST Framework, `PageNumberPagination`.
 *
 *   request   `page` (from 1), `page_size`, `search`, `ordering=-name,created`,
 *             lists as `status=a&status=b`
 *   list      `{ count, next, previous, results }`
 *   record    the body itself
 *   update    `PATCH /{resource}/{id}/`
 *   paths     with DRF's trailing slash: `/{resource}/`, `/{resource}/{id}/`,
 *             and on an action that continues the collection's path
 *             (`/{resource}/{id}/cancel/`)
 *
 * A page past the last one is a 404 in DRF ("Invalid page."), which is what a
 * table asks for once the last row of its last page is deleted. The dialect
 * says so (`isPastLastPage`), and the collection shows the empty page any
 * other backend would have answered with, after reading the first page to be
 * sure: see `CollectionDialect.isPastLastPage`.
 *
 * The answer names neither the page nor its size, so both come from the
 * request, and the size from the answer where it can be seen (a backend with
 * `max_page_size` serves fewer rows than were asked for). DRF ignores
 * `page_size` unless the pagination class sets `page_size_query_param`.
 * `search` and `ordering` are `SearchFilter` and `OrderingFilter`.
 *
 * An object filter has no convention here: give it a serializer.
 */
export const drfDialect: CollectionDialect = {
  name: 'drf',
  query: {
    page: 'page',
    pageSize: 'page_size',
    search: 'search',
    sort: '-field',
    sortParam: 'ordering',
    arrays: 'repeat',
  },
  parseList: parseDrfPage,
  paths: DRF_PATHS,
  // `{"detail": "Invalid page."}`, in whatever language the request asked for.
  isPastLastPage: (error) => error.status === 404,
}

/**
 * Django REST Framework, `LimitOffsetPagination`: the same answer, asked for
 * with `limit` and `offset`. The app still pages from 1; the offset is
 * `(page - 1) * pageSize`, so a list needs a `pageSize` to leave its first
 * page.
 */
export const drfLimitOffsetDialect: CollectionDialect = {
  name: 'drf-limit-offset',
  query: {
    paging: 'offset',
    page: 'offset',
    pageSize: 'limit',
    search: 'search',
    sort: '-field',
    sortParam: 'ordering',
    arrays: 'repeat',
  },
  parseList: parseDrfPage,
  paths: DRF_PATHS,
}

/**
 * Django REST Framework, `CursorPagination`: `{ next, previous, results }`,
 * where the cursor is the `cursor` parameter of the `next` link. Read with
 * `useInfiniteList`.
 *
 * The pagination class fixes the ordering unless the view also has an
 * `OrderingFilter`: without one, leave `sortBy` out of the filters, since DRF
 * would ignore `ordering` and the list would not be in the order the UI shows.
 */
export const drfCursorDialect: CollectionDialect = {
  name: 'drf-cursor',
  query: {
    paging: 'cursor',
    cursor: 'cursor',
    pageSize: 'page_size',
    search: 'search',
    sort: '-field',
    sortParam: 'ordering',
    arrays: 'repeat',
  },
  parseList(raw) {
    if (!isRecord(raw)) return null
    const nextCursor = cursorInLink(raw.next, 'cursor')
    return {
      items: raw.results,
      meta: {
        nextCursor,
        prevCursor: cursorInLink(raw.previous, 'cursor'),
        hasMore: nextCursor !== null,
      },
    }
  },
  paths: DRF_PATHS,
}

/**
 * Spring Data's `Page`.
 *
 *   request   `page` (from 0), `size`, `search`, `sort=name,desc` repeated
 *             per column, lists as `status=a&status=b`, objects as
 *             `range.from=…`
 *   list      `{ content, totalElements, totalPages, number, size }`, or the
 *             `PagedModel` of Spring Data 3.3+
 *             `{ content, page: { size, number, totalElements, totalPages } }`
 *   record    the body itself
 *   update    `PATCH /{resource}/{id}`
 *
 * `page`, `size` and `sort` are what a `Pageable` argument binds. `search` is
 * not a Spring convention: a controller has to read it.
 *
 * The update stays a PATCH although many Spring controllers only map PUT. A
 * PUT replaces the record, and the app's update sends a patch: sent as a PUT,
 * every field the patch leaves out would be cleared, silently, where a 405
 * says what is wrong. Where a controller takes PUT, say `updateMethod: 'PUT'`
 * on that collection and pass it the whole record.
 */
export const springDialect: CollectionDialect = {
  name: 'spring',
  query: {
    page: 'page',
    pageSize: 'size',
    pageBase: 0,
    search: 'search',
    sort: 'field,dir',
    sortParam: 'sort',
    arrays: 'repeat',
    objects: flatFilter('.'),
  },
  parseList(raw) {
    if (!isRecord(raw)) return null
    const page = isRecord(raw.page) ? raw.page : raw
    const number = count(page.number)
    return {
      items: raw.content,
      meta: pageMetaOf({
        total: page.totalElements,
        page: typeof number === 'number' ? number + 1 : number,
        pageSize: page.size,
        totalPages: page.totalPages,
      }),
    }
  },
}

/**
 * `nestjs-paginate`.
 *
 *   request   `page` (from 1), `limit`, `search`, `sortBy=name:DESC` repeated
 *             per column, filters as `filter.status=open`, lists as
 *             `filter.status=$in:open,late`
 *   list      `{ data, meta: { itemsPerPage, totalItems, currentPage, totalPages }, links }`
 *   record    the body itself
 *   update    `PATCH /{resource}/{id}`
 *
 * This is one library's convention, not NestJS's: `presets.nest` does not
 * include it. Name it under `collection` in `api.overrides.ts`.
 */
export const nestPaginateDialect: CollectionDialect = {
  name: 'nestjs-paginate',
  query: {
    page: 'page',
    pageSize: 'limit',
    search: 'search',
    sort: (terms) => ({
      sortBy: terms.map((term) => `${term.field}:${term.direction.toUpperCase()}`),
    }),
    filterName: (name) => `filter.${name}`,
    arrays: (values, param) => ({ [param]: `$in:${values.join(',')}` }),
  },
  parseList(raw) {
    if (!isRecord(raw)) return null
    const meta = isRecord(raw.meta) ? raw.meta : {}
    return {
      items: raw.data,
      meta: pageMetaOf({
        total: meta.totalItems,
        page: meta.currentPage,
        pageSize: meta.itemsPerPage,
        totalPages: meta.totalPages,
      }),
    }
  },
}

/** The shipped dialects, by name. */
export const dialects = {
  vuestrata: vuestrataDialect,
  laravel: laravelDialect,
  laravelCursor: laravelCursorDialect,
  drf: drfDialect,
  drfLimitOffset: drfLimitOffsetDialect,
  drfCursor: drfCursorDialect,
  spring: springDialect,
  nestPaginate: nestPaginateDialect,
} as const

// ─── Renaming keys ──────────────────────────────────────────────────────────

const SNAKE_KEY = /^_*[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/
const PASCAL_KEY = /^[A-Z][A-Za-z0-9]*$/
const CAMEL_KEY = /^_*[a-z][A-Za-z0-9]*$/
const LEADING_CAPITALS = /^[A-Z]+/

/** `URLValue` as `urlValue`, `ID` as `id`, `Contact` as `contact`. */
function lowerLeadingCapitals(word: string): string {
  const run = LEADING_CAPITALS.exec(word)?.[0].length ?? 0
  if (run === 0) return word
  // The last capital of a run starts the next word when a lower-case letter
  // follows it: `URLValue` is `URL` + `Value`.
  const startsNextWord = run > 1 && /[a-z]/.test(word.charAt(run))
  const lowered = startsNextWord ? run - 1 : run
  return word.slice(0, lowered).toLowerCase() + word.slice(lowered)
}

function capitalize(word: string): string {
  const lowered = word === word.toUpperCase() ? word.toLowerCase() : word
  return lowered.charAt(0).toUpperCase() + lowered.slice(1)
}

/**
 * A snake_case or PascalCase key in camelCase: `contact_name`, `ContactName`
 * and `CONTACT_NAME` all become `contactName`. Leading underscores stay
 * (`_links`). A key that is neither, such as `@odata.count`, `first-name` or
 * `__proto__`, is returned as it is.
 */
export function camelCase(key: string): string {
  if (SNAKE_KEY.test(key)) {
    const lead = /^_*/.exec(key)?.[0] ?? ''
    const [first = '', ...rest] = key.slice(lead.length).split('_')
    const head = first === first.toUpperCase() ? first.toLowerCase() : lowerLeadingCapitals(first)
    return lead + head + rest.map(capitalize).join('')
  }
  return PASCAL_KEY.test(key) ? lowerLeadingCapitals(key) : key
}

/** A camelCase key in snake_case: `contactName` as `contact_name`, `userID` as `user_id`. */
export function snakeCase(key: string): string {
  if (!CAMEL_KEY.test(key)) return key
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

/** A camelCase key in PascalCase: `contactName` as `ContactName`. */
export function pascalCase(key: string): string {
  return CAMEL_KEY.test(key) && !key.startsWith('_')
    ? key.charAt(0).toUpperCase() + key.slice(1)
    : key
}

/** One app key as the backend spells it. */
function toWireKey(key: string, keys: KeyTransform): string {
  const names = keys.names
  if (names && Object.hasOwn(names, key)) return names[key]!
  return keys.wire === 'pascal' ? pascalCase(key) : snakeCase(key)
}

/** One backend key as the app spells it. */
function toAppKey(key: string, keys: KeyTransform): string {
  for (const [appName, wireName] of Object.entries(keys.names ?? {})) {
    if (wireName === key) return appName
  }
  return camelCase(key)
}

/** Only these are renamed into: a `Date`, a `File` or a class instance is a value. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Deeper than any payload a form or a table handles, and far short of the
 * call stack: past it a value is passed through as it is.
 */
const MAX_KEY_DEPTH = 64

type CompiledPlan = { opaque: string[][]; dictionaries: string[][] }

function compilePlan(keys: KeyTransform, plan: KeyPlan | undefined): CompiledPlan {
  // The empty path is the payload itself: no segments, not one empty segment.
  const split = (paths: readonly string[] | undefined) =>
    (paths ?? []).map((path) => (path === '' ? [] : path.split('.')))
  return {
    opaque: [...split(keys.opaque), ...split(plan?.opaque)],
    dictionaries: [...split(keys.dictionaries), ...split(plan?.dictionaries)],
  }
}

function matchesPath(patterns: string[][], path: string[]): boolean {
  return patterns.some(
    (pattern) =>
      pattern.length === path.length &&
      pattern.every((segment, index) => segment === '*' || segment === path[index]),
  )
}

/**
 * What a renaming reports, to whoever wants to know. Names only: a payload's
 * values are never passed to either function.
 */
export interface KeyRenameReport {
  /** Every key that was looked at: as it was given, and as it was renamed. */
  renamed?: (given: string, renamed: string) => void
  /**
   * Two keys of one object were renamed to the same name, so one value
   * replaced the other: `{ user_id, userId }` read into camelCase. `given`
   * lists the keys that collided, in the order they were met; the last wins.
   */
  collision?: (renamed: string, given: readonly string[]) => void
}

interface RenameRun {
  rename: (key: string) => string
  /** Paths are in the app's case: the key before renaming on the way out, after it on the way in. */
  appKeyIs: 'given' | 'renamed'
  plan: CompiledPlan
  report: KeyRenameReport | undefined
  /**
   * The objects being renamed right now, from the root down to here. Meeting
   * one again is a cycle. The depth cap alone does not end it: an object that
   * refers to itself twice is walked two to the power of that depth times.
   */
  ancestors: Set<object>
}

function renameDeep(value: unknown, run: RenameRun, path: string[]): unknown {
  if (path.length > MAX_KEY_DEPTH) return value
  if (matchesPath(run.plan.opaque, path)) return value
  if (typeof value !== 'object' || value === null) return value
  // A cycle is handed back as it is: serializing it then fails as it always
  // would have, with JSON's own error, instead of never returning.
  if (run.ancestors.has(value)) return value

  if (Array.isArray(value)) {
    run.ancestors.add(value)
    path.push('*')
    const renamed: unknown[] = value.map((item) => renameDeep(item, run, path))
    path.pop()
    run.ancestors.delete(value)
    return renamed
  }
  if (!isPlainObject(value)) return value

  run.ancestors.add(value)
  const keepKeys = matchesPath(run.plan.dictionaries, path)
  const entries: [string, unknown][] = []
  // Only looked for when someone is listening: what was renamed to each name.
  const sources = run.report?.collision && !keepKeys ? new Map<string, string[]>() : undefined
  for (const [key, child] of Object.entries(value)) {
    const renamedKey = keepKeys ? key : run.rename(key)
    if (!keepKeys) run.report?.renamed?.(key, renamedKey)
    if (sources) {
      const before = sources.get(renamedKey)
      if (before) before.push(key)
      else sources.set(renamedKey, [key])
    }
    path.push(run.appKeyIs === 'given' ? key : renamedKey)
    entries.push([renamedKey, renameDeep(child, run, path)])
    path.pop()
  }
  run.ancestors.delete(value)
  if (sources) {
    for (const [renamedKey, given] of sources) {
      if (given.length > 1) run.report?.collision?.(renamedKey, given)
    }
  }
  // `fromEntries` defines own properties: a key named `__proto__` stays a key.
  return Object.fromEntries(entries)
}

/** A response's rows or record, with the backend's keys renamed to camelCase. */
export function keysToApp(
  value: unknown,
  keys: KeyTransform,
  plan?: KeyPlan,
  report?: KeyRenameReport,
): unknown {
  return renameDeep(
    value,
    {
      rename: (key) => toAppKey(key, keys),
      appKeyIs: 'renamed',
      plan: compilePlan(keys, plan),
      report,
      ancestors: new Set(),
    },
    [],
  )
}

/** A request body, with the app's keys renamed to the backend's case. */
export function keysToWire(
  value: unknown,
  keys: KeyTransform,
  plan?: KeyPlan,
  report?: KeyRenameReport,
): unknown {
  return renameDeep(
    value,
    {
      rename: (key) => toWireKey(key, keys),
      appKeyIs: 'given',
      plan: compilePlan(keys, plan),
      report,
      ancestors: new Set(),
    },
    [],
  )
}

/**
 * A key the case rule does not bring back to where it started, or `null` for
 * one it does. Two ways round, because each catches what the other cannot:
 *
 *   from the app   `userID` is sent as `user_id`, which is read back as
 *                  `userId`: the schema's `userID` never arrives
 *   from the wire  `address_line_1` is read as `addressLine1`, which is sent
 *                  back as `address_line1`: a write the backend ignores
 *
 * `app` and `wire` are the `names` entry that fixes both directions:
 * `{ app: 'userID', wire: 'user_id' }` is `names: { userID: 'user_id' }`.
 * `back` is what the key came back as instead of itself.
 */
export function unstableKey(
  key: string,
  from: 'app' | 'wire',
  keys: KeyTransform,
): { app: string; wire: string; back: string } | null {
  if (from === 'app') {
    const wire = toWireKey(key, keys)
    const back = toAppKey(wire, keys)
    return back === key ? null : { app: key, wire, back }
  }
  const app = toAppKey(key, keys)
  const back = toWireKey(app, keys)
  return back === key ? null : { app, wire: key, back }
}

/** The part of a zod schema this file reads: its definition, structurally. */
function definitionOf(schema: unknown): Record<string, unknown> | undefined {
  const internals = (schema as { _zod?: { def?: unknown } } | null | undefined)?._zod
  return isRecord(internals?.def) ? internals.def : undefined
}

const WRAPPER_TYPES = [
  'optional',
  'nullable',
  'default',
  'prefault',
  'readonly',
  'catch',
  'nonoptional',
]

/** The schema under optional, nullable, default and lazy wrappers. */
function unwrapSchema(schema: unknown, budget = 8): unknown {
  const definition = definitionOf(schema)
  if (!definition || budget === 0) return schema
  if (WRAPPER_TYPES.includes(String(definition.type))) {
    return unwrapSchema(definition.innerType, budget - 1)
  }
  if (definition.type === 'pipe') {
    // `schema.transform(fn)` is a pipe out of the schema; `z.preprocess(fn,
    // schema)` is a pipe into it. Either way the schema is the other end.
    const preprocessed = definitionOf(definition.in)?.type === 'transform'
    return unwrapSchema(preprocessed ? definition.out : definition.in, budget - 1)
  }
  if (definition.type === 'lazy' && typeof definition.getter === 'function') {
    try {
      return unwrapSchema((definition.getter as () => unknown)(), budget - 1)
    } catch {
      return schema
    }
  }
  return schema
}

/**
 * Where a zod schema says key renaming must not apply: its `z.record()`s and
 * its `z.unknown()` and `z.any()` fields. See `KeyTransform` for what the
 * two lists mean, and for what a schema cannot say.
 *
 * Reads the schema's structure only; a value that is not a zod schema yields
 * an empty plan.
 */
export function schemaKeyPlan(schema: unknown): KeyPlan {
  const opaque: string[] = []
  const dictionaries: string[] = []
  const fields = new Set<string>()
  // The schemas being walked right now: meeting one again is a recursive
  // schema, and following it would never end.
  const walking = new Set<unknown>()

  function walk(candidate: unknown, path: string[]): void {
    // Both sides of the unwrapping are remembered: a `z.lazy()` hands out a
    // new inner schema on every call, so only the lazy itself can be met again.
    if (walking.has(candidate) || path.length > MAX_KEY_DEPTH) return
    const schema = unwrapSchema(candidate)
    const definition = definitionOf(schema)
    if (!definition || walking.has(schema)) return
    walking.add(candidate)
    walking.add(schema)

    switch (definition.type) {
      case 'object':
        if (isRecord(definition.shape)) {
          for (const [key, child] of Object.entries(definition.shape)) {
            fields.add(key)
            walk(child, [...path, key])
          }
        }
        break
      case 'array':
        walk(definition.element, [...path, '*'])
        break
      case 'tuple':
        if (Array.isArray(definition.items)) {
          for (const item of definition.items) walk(item, [...path, '*'])
        }
        break
      case 'union':
        if (Array.isArray(definition.options)) {
          for (const option of definition.options) walk(option, path)
        }
        break
      case 'intersection':
        walk(definition.left, path)
        walk(definition.right, path)
        break
      case 'record':
      case 'map': {
        // At the root too: a schema that is itself a record is a dictionary
        // from its first key, under the empty path.
        const valueType = definitionOf(unwrapSchema(definition.valueType))?.type
        if (valueType === 'object' || valueType === 'array' || valueType === 'record') {
          dictionaries.push(path.join('.'))
          walk(definition.valueType, [...path, '*'])
        } else {
          opaque.push(path.join('.'))
        }
        break
      }
      case 'unknown':
      case 'any':
        if (path.length > 0) opaque.push(path.join('.'))
        break
    }

    walking.delete(candidate)
    walking.delete(schema)
  }

  walk(schema, [])
  return { opaque, dictionaries, fields: [...fields] }
}
