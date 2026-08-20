/**
 * A REST collection, mocked.
 *
 * Eight domain modules need the same endpoint shape — list with search, filter,
 * sort and pagination, plus read/create/update/delete on a single record. Each
 * hand-writing it would be eight chances to disagree about whether the page
 * parameter is `page` or `pageNumber`, and eight places to fix a sort bug.
 *
 * The abstraction is justified by those eight call sites, not invented ahead of
 * them: this file was written after the third domain repeated the same 90 lines.
 *
 * Query contract (matching the existing `/users` handler, which predates this):
 *   page, pageSize, search, sortBy, sortOrder, plus arbitrary field filters
 * Response:
 *   { data: T[], meta: { total, page, pageSize, totalPages } }
 */
import { delay, http, HttpResponse, type HttpHandler } from 'msw'

import type { PaginatedResponse } from '~/types'

import { isValidToken, mockApiUrl } from './utils'

export interface CollectionRecord {
  id: string
}

export interface CollectionOptions<T extends CollectionRecord> {
  /** Path segment, e.g. `orders` — matched as `*<apiBasePath>/orders`. */
  resource: string
  /** Seeded records. Copied on write; the seed array is never mutated. */
  seed: T[]
  /** Fields scanned by the `search` parameter, case-insensitively. */
  searchFields: (keyof T & string)[]
  /**
   * Query parameters that filter by exact match on a field of the same name.
   * Anything not listed is ignored rather than silently returning nothing.
   */
  filterFields?: (keyof T & string)[]
  /**
   * Timestamp field filtered by the `from` / `to` query parameters.
   *
   * A calendar asking for one month, or a report asking for one quarter, cannot
   * express that as an exact-match filter. Both are inclusive ISO bounds and
   * both are optional, so `?from=…` alone means "from then onwards".
   */
  rangeField?: keyof T & string
  /** Default sort when the request does not ask for one. */
  defaultSort?: { by: keyof T & string; order: 'asc' | 'desc' }
  /** Builds a new record from a POST body. Return `null` to reject with 422. */
  create?: (body: Record<string, unknown>, existing: T[]) => T | null
  /** Applies a PATCH body. Return `null` to reject with 422. */
  update?: (record: T, body: Record<string, unknown>) => T | null
  /** Simulated latency in ms. */
  latency?: number
}

/**
 * Coerce a field to something orderable.
 *
 * Dates arrive as ISO strings, which sort correctly as text only while every
 * value has the same length and offset — `Date.parse` removes that assumption.
 * Booleans become 0/1 so `sortBy=isActive` does something sensible instead of
 * comparing `true > false` as strings.
 */
function sortableValue(value: unknown): number | string {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? value.toLowerCase() : parsed
  }
  return ''
}

function matchesSearch<T extends CollectionRecord>(
  record: T,
  fields: (keyof T & string)[],
  term: string,
): boolean {
  return fields.some((field) => {
    const value = record[field]
    return typeof value === 'string' && value.toLowerCase().includes(term)
  })
}

export interface CollectionMock<T extends CollectionRecord> {
  handlers: HttpHandler[]
  /** Current records — for tests that need to assert on mutation results. */
  peek: () => readonly T[]
  /** Restore the seed. Called between tests so one suite cannot leak into another. */
  reset: () => void
}

export function createCollectionMock<T extends CollectionRecord>(
  options: CollectionOptions<T>,
): CollectionMock<T> {
  const {
    resource,
    seed,
    searchFields,
    filterFields = [],
    rangeField,
    defaultSort,
    create,
    update,
    latency = 180,
  } = options

  // A shallow copy per record: handlers replace records wholesale rather than
  // mutating them, so the seed stays pristine and `reset()` is honest.
  let records: T[] = seed.map((record) => ({ ...record }))

  function unauthorized(request: Request): HttpResponse<{ message: string }> | null {
    if (isValidToken(request)) return null
    return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const handlers: HttpHandler[] = [
    http.get(mockApiUrl(`/${resource}`), async ({ request }) => {
      await delay(latency)
      const denied = unauthorized(request)
      if (denied) return denied

      const url = new URL(request.url)
      const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? '10')))
      const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
      const sortBy = url.searchParams.get('sortBy') ?? defaultSort?.by
      const sortOrder =
        (url.searchParams.get('sortOrder') ?? defaultSort?.order) === 'desc' ? 'desc' : 'asc'

      let filtered = records
      if (search)
        filtered = filtered.filter((record) => matchesSearch(record, searchFields, search))

      for (const field of filterFields) {
        const value = url.searchParams.get(field)
        // An empty string means "no filter", not "match the empty value" —
        // otherwise clearing a select in the UI returns zero rows.
        if (value === null || value === '' || value === 'all') continue
        filtered = filtered.filter((record) => String(record[field]) === value)
      }

      if (rangeField) {
        // Parsed to epoch milliseconds rather than compared as strings: ISO
        // timestamps only sort lexically while every value shares a format and
        // an offset, and `2026-07-29T09:00:00Z` vs `2026-07-29T09:00:00+02:00`
        // breaks that the first time a second timezone appears.
        const from = Date.parse(url.searchParams.get('from') ?? '')
        const to = Date.parse(url.searchParams.get('to') ?? '')

        if (!Number.isNaN(from)) {
          filtered = filtered.filter((record) => Date.parse(String(record[rangeField])) >= from)
        }
        if (!Number.isNaN(to)) {
          filtered = filtered.filter((record) => Date.parse(String(record[rangeField])) <= to)
        }
      }

      if (sortBy) {
        filtered = [...filtered].sort((left, right) => {
          const a = sortableValue(left[sortBy as keyof T])
          const b = sortableValue(right[sortBy as keyof T])
          if (a < b) return sortOrder === 'asc' ? -1 : 1
          if (a > b) return sortOrder === 'asc' ? 1 : -1
          return 0
        })
      }

      const total = filtered.length
      const start = (page - 1) * pageSize

      return HttpResponse.json({
        data: filtered.slice(start, start + pageSize),
        meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      } satisfies PaginatedResponse<T>)
    }),

    http.get(mockApiUrl(`/${resource}/:id`), async ({ request, params }) => {
      await delay(latency)
      const denied = unauthorized(request)
      if (denied) return denied

      const record = records.find((candidate) => candidate.id === params.id)
      if (!record) return HttpResponse.json({ message: 'Not found' }, { status: 404 })
      return HttpResponse.json(record)
    }),
  ]

  if (create) {
    handlers.push(
      http.post(mockApiUrl(`/${resource}`), async ({ request }) => {
        await delay(latency)
        const denied = unauthorized(request)
        if (denied) return denied

        const body = (await request.json()) as Record<string, unknown>
        const created = create(body, records)
        if (!created) return HttpResponse.json({ message: 'Invalid payload' }, { status: 422 })

        // Prepended, not appended, so a collection with no `defaultSort` shows
        // the new record at the top rather than on the last page. Collections
        // that DO declare a sort order will place it wherever that sort puts
        // it — insertion order is a fallback, not a guarantee.
        records = [created, ...records]
        return HttpResponse.json(created, { status: 201 })
      }),
    )
  }

  if (update) {
    handlers.push(
      http.patch(mockApiUrl(`/${resource}/:id`), async ({ request, params }) => {
        await delay(latency)
        const denied = unauthorized(request)
        if (denied) return denied

        const index = records.findIndex((candidate) => candidate.id === params.id)
        if (index === -1) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

        const body = (await request.json()) as Record<string, unknown>
        const next = update(records[index]!, body)
        if (!next) return HttpResponse.json({ message: 'Invalid payload' }, { status: 422 })

        records = records.map((record, position) => (position === index ? next : record))
        return HttpResponse.json(next)
      }),
      http.delete(mockApiUrl(`/${resource}/:id`), async ({ request, params }) => {
        await delay(latency)
        const denied = unauthorized(request)
        if (denied) return denied

        const exists = records.some((candidate) => candidate.id === params.id)
        if (!exists) return HttpResponse.json({ message: 'Not found' }, { status: 404 })

        records = records.filter((record) => record.id !== params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )
  }

  return {
    handlers,
    peek: () => records,
    reset: () => {
      records = seed.map((record) => ({ ...record }))
    },
  }
}
