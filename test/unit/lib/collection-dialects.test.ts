import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { z } from 'zod'

import { toQueryParams } from '@/lib/api/collection-queries'
import {
  bracketFilter,
  camelCase,
  defineCollectionDialect,
  dialects,
  extendDialect,
  flatFilter,
  keysToApp,
  keysToWire,
  listContext,
  pageMetaOf,
  pascalCase,
  resolveCollectionDialect,
  schemaKeyPlan,
  snakeCase,
  toCollectionParams,
  unwrapData,
  unstableKey,
  type CollectionDialect,
} from '@/lib/api/dialects'
import { AppError } from '@/lib/errors'

import { captureLogged } from '../../utils/logged'

/** What the collection layer warned about during the test. */
const logged = { warnings: (): string[] => [], restore: (): void => {} }

beforeEach(() => Object.assign(logged, captureLogged()))
afterEach(() => logged.restore())

/**
 * Each shipped dialect against the payloads its framework documents: what the
 * list request looks like, and what the app reads out of the answer. The
 * response bodies below are the examples from each framework's own
 * documentation, cut down to a row or two.
 */

/** What the app sees of a list, whatever the backend. */
function read(dialect: CollectionDialect, raw: unknown, filters: object = {}) {
  return resolveCollectionDialect(dialect).parseList(raw, listContext(filters))
}

const tableState = { page: 2, pageSize: 20, search: 'ada', sortBy: 'name', sortOrder: 'desc' }

describe('the vuestrata dialect', () => {
  it.each([
    [{}],
    [{ page: 1, pageSize: 25, search: 'a b' }],
    [{ sortBy: 'name', sortOrder: 'asc' }],
    [{ status: '', role: 'all', owner: null, team: undefined }],
    [{ active: true, archived: false, count: 0 }],
    [{ tags: ['a', 'b'], range: { from: 1, to: 2 }, when: new Date(0) }],
    [{ status: 'All', name: ' ', zero: '0' }],
    // Reserved names holding what cannot be a parameter are dropped like any other.
    [{ page: { n: 1 }, pageSize: [10], search: { q: 'x' }, sortBy: ['a'], sortOrder: {} }],
    [{ sort: [{ field: 'name', direction: 'desc' }], cursor: 'abc' }],
  ])('sends %j exactly as toQueryParams does', (filters) => {
    const params = toCollectionParams(filters, dialects.vuestrata)

    expect(params).toEqual(toQueryParams(filters))
    // Order is part of the wire: the query string is written in it.
    expect(Object.keys(params)).toEqual(Object.keys(toQueryParams(filters)))
  })

  it('reads { data, meta } without touching either', () => {
    const meta = { total: 12, page: 2, pageSize: 5, totalPages: 3 }
    const data = [{ id: '1' }]

    const parsed = read(dialects.vuestrata, { data, meta, links: {} })

    expect(parsed?.items).toBe(data)
    expect(parsed?.meta).toBe(meta)
  })

  it.each([[null], [[{ id: '1' }]], ['<html>'], [42]])('does not read %j as a list', (raw) => {
    expect(read(dialects.vuestrata, raw)).toBeNull()
  })

  it('resolves to the plain record, PATCH and /{base}/{id}', () => {
    const resolved = resolveCollectionDialect(dialects.vuestrata)
    const record = { data: { id: '1' } }

    expect(resolved.unwrapRecord(record)).toBe(record)
    expect(resolved.wrapRecord(record, { operation: 'create', resource: 'x' })).toBe(record)
    expect(resolved.keys).toBeNull()
    expect(resolved.updateMethod).toBe('PATCH')
    expect(resolved.paths.list('/orders')).toBe('/orders')
    expect(resolved.paths.detail('/orders', 'O-1')).toBe('/orders/O-1')
  })

  it('can be extended to send lists', () => {
    const lists = extendDialect(dialects.vuestrata, { query: { arrays: 'repeat' } })

    expect(toCollectionParams({ page: 1, tags: ['a', 'b'], range: { from: 1 } }, lists)).toEqual({
      page: '1',
      tags: ['a', 'b'],
    })
  })
})

describe('the laravel dialect', () => {
  it('asks for page, per_page and a signed sort', () => {
    expect(toCollectionParams(tableState, dialects.laravel)).toEqual({
      page: '2',
      per_page: '20',
      search: 'ada',
      sort: '-name',
    })
    expect(toCollectionParams({ sortBy: 'name', sortOrder: 'asc' }, dialects.laravel)).toEqual({
      sort: 'name',
    })
  })

  it('sends several sort columns, lists in brackets and objects nested', () => {
    expect(
      toCollectionParams(
        {
          sort: [{ field: 'status' }, { field: 'created_at', direction: 'desc' }],
          // Ignored once `sort` names the columns.
          sortBy: 'name',
          status: ['open', 'late'],
          created: { from: '2026-01-01', to: '2026-02-01' },
        },
        dialects.laravel,
      ),
    ).toEqual({
      sort: 'status,-created_at',
      'status[]': ['open', 'late'],
      'created[from]': '2026-01-01',
      'created[to]': '2026-02-01',
    })
  })

  it('drops cleared filters, an empty list included', () => {
    expect(
      toCollectionParams(
        { status: '', role: 'all', owner: null, tags: [], more: ['', null], sortBy: '' },
        dialects.laravel,
      ),
    ).toEqual({})
  })

  it('reads an API Resource collection', () => {
    // https://laravel.com/docs/eloquent-resources#pagination
    const raw = {
      data: [
        { id: 1, name: 'Eladio Schroeder Sr.', email: 'therese28@example.com' },
        { id: 2, name: 'Liliana Mayert', email: 'evandervort@example.com' },
      ],
      links: {
        first: 'http://example.com/users?page=1',
        last: 'http://example.com/users?page=1',
        prev: null,
        next: null,
      },
      meta: {
        current_page: 1,
        from: 1,
        last_page: 1,
        path: 'http://example.com/users',
        per_page: 15,
        to: 10,
        total: 10,
      },
    }

    expect(read(dialects.laravel, raw)).toEqual({
      items: raw.data,
      meta: { total: 10, page: 1, pageSize: 15, totalPages: 1 },
    })
  })

  it('reads paginate() returned as it is', () => {
    // https://laravel.com/docs/pagination#converting-results-to-json
    const raw = {
      total: 50,
      per_page: 15,
      current_page: 4,
      last_page: 4,
      first_page_url: 'http://laravel.app?page=1',
      last_page_url: 'http://laravel.app?page=4',
      next_page_url: null,
      prev_page_url: 'http://laravel.app?page=3',
      path: 'http://laravel.app',
      from: 46,
      to: 50,
      data: [{ id: 46 }, { id: 47 }],
    }

    expect(read(dialects.laravel, raw)?.meta).toEqual({
      total: 50,
      page: 4,
      pageSize: 15,
      totalPages: 4,
    })
  })

  it('reads a page size the controller echoed back as text', () => {
    const raw = { data: [], current_page: 1, last_page: 1, per_page: '25', total: 0 }

    expect(read(dialects.laravel, raw)?.meta).toEqual({
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    })
  })

  it('unwraps an API Resource, and leaves a bare model alone', () => {
    const { unwrapRecord } = resolveCollectionDialect(dialects.laravel)
    const model = { id: 7, name: 'Ada' }

    expect(unwrapRecord({ data: model })).toBe(model)
    expect(unwrapRecord(model)).toBe(model)
  })

  it('reads cursorPaginate()', () => {
    // https://laravel.com/docs/pagination#cursor-pagination
    const raw = {
      data: [{ id: 1 }, { id: 2 }],
      path: 'http://laravel.app/users',
      per_page: 15,
      next_cursor: 'eyJpZCI6MTUsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0',
      next_page_url:
        'http://laravel.app/users?cursor=eyJpZCI6MTUsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0',
      prev_cursor: null,
      prev_page_url: null,
    }

    expect(read(dialects.laravelCursor, raw)?.meta).toEqual({
      nextCursor: 'eyJpZCI6MTUsIl9wb2ludHNUb05leHRJdGVtcyI6dHJ1ZX0',
      prevCursor: null,
      hasMore: true,
      pageSize: 15,
    })
    expect(
      toCollectionParams({ page: 3, pageSize: 15, cursor: 'abc' }, dialects.laravelCursor),
    ).toEqual({ per_page: '15', cursor: 'abc' })
  })
})

describe('the drf dialect', () => {
  it('asks for page, page_size and ordering', () => {
    expect(toCollectionParams(tableState, dialects.drf)).toEqual({
      page: '2',
      page_size: '20',
      search: 'ada',
      ordering: '-name',
    })
  })

  it('sends several sort columns in one parameter, and a list as a repeated one', () => {
    expect(
      toCollectionParams(
        {
          sort: [{ field: 'name', direction: 'desc' }, { field: 'created' }],
          status: ['open', 'late'],
        },
        dialects.drf,
      ),
    ).toEqual({ ordering: '-name,created', status: ['open', 'late'] })
  })

  it('has no convention for an object filter, and says so', () => {
    expect(() => toCollectionParams({ created: { from: 'a' } }, dialects.drf)).toThrow(
      /"drf" collection dialect cannot send the filter "created"/,
    )
  })

  it('puts the trailing slash on an action that continues the collection’s path', () => {
    const { paths } = resolveCollectionDialect(dialects.drf)

    expect(paths.action('/orders/7/cancel')).toBe('/orders/7/cancel/')
    expect(paths.action('/orders/7/cancel/')).toBe('/orders/7/cancel/')
    expect(paths.action('/orders/7/export?format=csv')).toBe('/orders/7/export/?format=csv')
    expect(paths.action('/orders/7/export/?format=csv#top')).toBe(
      '/orders/7/export/?format=csv#top',
    )
    // Every other dialect sends the path as the action wrote it.
    expect(resolveCollectionDialect(dialects.laravel).paths.action('/orders/7/cancel')).toBe(
      '/orders/7/cancel',
    )
  })

  it('puts the trailing slash on both paths', () => {
    const { paths } = resolveCollectionDialect(dialects.drf)

    expect(paths.list('/accounts')).toBe('/accounts/')
    expect(paths.detail('/accounts', '7')).toBe('/accounts/7/')
  })

  it('reads PageNumberPagination, taking the page from the request', () => {
    // https://www.django-rest-framework.org/api-guide/pagination/#pagenumberpagination
    const raw = {
      count: 1023,
      next: 'https://api.example.org/accounts/?page=5',
      previous: 'https://api.example.org/accounts/?page=3',
      results: [{ id: 1 }, { id: 2 }, { id: 3 }],
    }

    expect(read(dialects.drf, raw, { page: 4, pageSize: 3 })).toEqual({
      items: raw.results,
      meta: { total: 1023, page: 4, pageSize: 3, totalPages: 341 },
    })
  })

  it('takes the page size from a full page when the backend capped the request', () => {
    const raw = { count: 50, next: 'https://x/?page=2', previous: null, results: [{}, {}, {}, {}] }

    // 100 were asked for; `max_page_size` served four.
    expect(read(dialects.drf, raw, { page: 1, pageSize: 100 })?.meta).toEqual({
      total: 50,
      page: 1,
      pageSize: 4,
      totalPages: 13,
    })
  })

  it('works the page size of a last page out from the rows before it', () => {
    const raw = { count: 7, next: null, previous: 'https://x/?page=2', results: [{ id: 7 }] }

    expect(read(dialects.drf, raw, { page: 3 })?.meta).toEqual({
      total: 7,
      page: 3,
      pageSize: 3,
      totalPages: 3,
    })
  })

  it('reads an empty list as one empty page', () => {
    const raw = { count: 0, next: null, previous: null, results: [] }

    expect(read(dialects.drf, raw, { page: 1, pageSize: 10 })?.meta).toEqual({
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })
    expect(read(dialects.drf, raw)?.meta).toEqual({ total: 0, page: 1, pageSize: 1, totalPages: 1 })
  })

  it('asks LimitOffsetPagination for an offset', () => {
    // https://www.django-rest-framework.org/api-guide/pagination/#limitoffsetpagination
    expect(toCollectionParams({ page: 6, pageSize: 100 }, dialects.drfLimitOffset)).toEqual({
      offset: '500',
      limit: '100',
    })
    expect(toCollectionParams({ page: 1, pageSize: 100 }, dialects.drfLimitOffset)).toEqual({
      offset: '0',
      limit: '100',
    })
    // The first page needs no offset; any other needs a page size to work one out.
    expect(toCollectionParams({ page: 1 }, dialects.drfLimitOffset)).toEqual({})
    expect(() => toCollectionParams({ page: 2 }, dialects.drfLimitOffset)).toThrow(/offset/)

    const raw = {
      count: 1023,
      next: 'https://api.example.org/accounts/?limit=100&offset=600',
      previous: 'https://api.example.org/accounts/?limit=100&offset=400',
      results: Array.from({ length: 100 }, (_, index) => ({ id: index })),
    }
    expect(read(dialects.drfLimitOffset, raw, { page: 6, pageSize: 100 })?.meta).toEqual({
      total: 1023,
      page: 6,
      pageSize: 100,
      totalPages: 11,
    })
  })

  it('reads CursorPagination from the next link', () => {
    // https://www.django-rest-framework.org/api-guide/pagination/#cursorpagination
    const raw = {
      next: 'http://api.example.org/accounts/?cursor=cD0yMDI2LTAxLTAx&page_size=10',
      previous: null,
      results: [{ id: 1 }],
    }

    expect(read(dialects.drfCursor, raw)).toEqual({
      items: raw.results,
      meta: { nextCursor: 'cD0yMDI2LTAxLTAx', prevCursor: null, hasMore: true },
    })
    expect(read(dialects.drfCursor, { next: null, previous: null, results: [] })?.meta).toEqual({
      nextCursor: null,
      prevCursor: null,
      hasMore: false,
    })
    expect(
      toCollectionParams({ page: 2, pageSize: 10, cursor: 'cD0y' }, dialects.drfCursor),
    ).toEqual({ page_size: '10', cursor: 'cD0y' })
  })
})

describe('the spring dialect', () => {
  it('counts pages from zero and writes the sort as field,dir', () => {
    expect(toCollectionParams(tableState, dialects.spring)).toEqual({
      page: '1',
      size: '20',
      search: 'ada',
      sort: ['name,desc'],
    })
    expect(toCollectionParams({ page: 1 }, dialects.spring)).toEqual({ page: '0' })
    expect(toCollectionParams({ page: '3' }, dialects.spring)).toEqual({ page: '2' })
  })

  it('repeats the sort per column, repeats a list, and binds an object by dots', () => {
    expect(
      toCollectionParams(
        {
          sort: [{ field: 'status' }, { field: 'createdAt', direction: 'desc' }],
          status: ['OPEN', 'LATE'],
          created: { from: '2026-01-01', to: new Date('2026-02-01T00:00:00.000Z') },
        },
        dialects.spring,
      ),
    ).toEqual({
      sort: ['status,asc', 'createdAt,desc'],
      status: ['OPEN', 'LATE'],
      'created.from': '2026-01-01',
      'created.to': '2026-02-01T00:00:00.000Z',
    })
  })

  it('reads a Page, with the page number moved to one-based', () => {
    // https://docs.spring.io/spring-data/commons/reference/repositories/core-extensions.html
    const raw = {
      content: [{ id: 1 }, { id: 2 }],
      pageable: { pageNumber: 0, pageSize: 20, offset: 0, paged: true, unpaged: false },
      last: false,
      totalPages: 3,
      totalElements: 50,
      size: 20,
      number: 0,
      first: true,
      numberOfElements: 20,
      empty: false,
    }

    expect(read(dialects.spring, raw)).toEqual({
      items: raw.content,
      meta: { total: 50, page: 1, pageSize: 20, totalPages: 3 },
    })
  })

  it('reads the PagedModel of Spring Data 3.3', () => {
    const raw = {
      content: [{ id: 41 }],
      page: { size: 20, number: 2, totalElements: 41, totalPages: 3 },
    }

    expect(read(dialects.spring, raw)?.meta).toEqual({
      total: 41,
      page: 3,
      pageSize: 20,
      totalPages: 3,
    })
  })

  it('reads an empty Page as one empty page', () => {
    const raw = { content: [], totalPages: 0, totalElements: 0, size: 20, number: 0, empty: true }

    expect(read(dialects.spring, raw)?.meta).toEqual({
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    })
  })

  it('updates with PATCH unless told PUT', () => {
    expect(resolveCollectionDialect(dialects.spring).updateMethod).toBe('PATCH')
    expect(
      resolveCollectionDialect(extendDialect(dialects.spring, { updateMethod: 'PUT' }))
        .updateMethod,
    ).toBe('PUT')
  })
})

describe('the nestjs-paginate dialect', () => {
  it('writes the request the library documents', () => {
    // https://github.com/ppetzold/nestjs-paginate#usage
    // http://localhost:3000/cats?limit=5&page=2&sortBy=color:DESC&search=i&filter.age=$gte:3
    expect(
      toCollectionParams(
        { pageSize: 5, page: 2, sortBy: 'color', sortOrder: 'desc', search: 'i', age: '$gte:3' },
        dialects.nestPaginate,
      ),
    ).toEqual({
      limit: '5',
      page: '2',
      sortBy: ['color:DESC'],
      search: 'i',
      'filter.age': '$gte:3',
    })
  })

  it('writes several sort columns and a list filter', () => {
    expect(
      toCollectionParams(
        {
          sort: [{ field: 'color', direction: 'desc' }, { field: 'name' }],
          color: ['white', 'brown'],
        },
        dialects.nestPaginate,
      ),
    ).toEqual({ sortBy: ['color:DESC', 'name:ASC'], 'filter.color': '$in:white,brown' })
  })

  it('reads the answer the library documents', () => {
    const raw = {
      data: [
        { id: 4, name: 'George', color: 'white', age: 3 },
        { id: 5, name: 'Leche', color: 'white', age: 6 },
      ],
      meta: {
        itemsPerPage: 5,
        totalItems: 12,
        currentPage: 2,
        totalPages: 3,
        sortBy: [['color', 'DESC']],
        search: 'i',
        filter: { age: '$gte:3' },
      },
      links: { current: 'http://localhost:3000/cats?limit=5&page=2' },
    }

    expect(read(dialects.nestPaginate, raw)).toEqual({
      items: raw.data,
      meta: { total: 12, page: 2, pageSize: 5, totalPages: 3 },
    })
  })
})

describe('what every dialect has in common', () => {
  const shipped = Object.entries(dialects)

  it.each(shipped)('%s drops a cleared filter', (_, dialect) => {
    const params = toCollectionParams(
      { status: '', role: 'all', owner: null, team: undefined },
      dialect,
    )

    expect(params).toEqual({})
  })

  it.each(shipped)('%s does not read a body that is not an object', (_, dialect) => {
    expect(read(dialect, null)).toBeNull()
    expect(read(dialect, '<!doctype html>')).toBeNull()
    expect(read(dialect, [])).toBeNull()
  })

  it.each(shipped)('%s passes on what it cannot read, for validation to name', (_, dialect) => {
    const parsed = read(dialect, { unrelated: true }, { page: 1, pageSize: 10 })

    expect(parsed).not.toBeNull()
    expect(parsed?.items).toBeUndefined()
  })
})

describe('pageMetaOf', () => {
  it('works totalPages out from the total', () => {
    expect(pageMetaOf({ total: 41, page: 1, pageSize: 20 }).totalPages).toBe(3)
    expect(pageMetaOf({ total: 40, page: 1, pageSize: 20 }).totalPages).toBe(2)
    expect(pageMetaOf({ total: 0, page: 1, pageSize: 20 }).totalPages).toBe(1)
  })

  it('keeps what the backend reported, but never less than one page', () => {
    expect(pageMetaOf({ total: 41, page: 1, pageSize: 20, totalPages: 9 }).totalPages).toBe(9)
    expect(pageMetaOf({ total: 0, page: 1, pageSize: 20, totalPages: 0 }).totalPages).toBe(1)
  })

  it('passes a value that is not a count on, to fail validation under its own name', () => {
    expect(pageMetaOf({ total: 'many', page: null, pageSize: 0 })).toEqual({
      total: 'many',
      page: null,
      pageSize: 0,
      totalPages: undefined,
    })
    expect(pageMetaOf({ total: 1, page: 1, pageSize: 1, totalPages: 'x' }).totalPages).toBe('x')
  })
})

describe('filters the conventions cannot write', () => {
  const strict = defineCollectionDialect({ name: 'strict', parseList: () => null })

  it('throws in development, naming the dialect and the filter', () => {
    expect(() => toCollectionParams({ range: { from: 1 } }, strict)).toThrow(
      'The "strict" collection dialect cannot send the filter "range": it is an object',
    )
    expect(() => toCollectionParams({ tags: [{ id: 1 }] }, strict)).toThrow(
      /list holding an object/,
    )
    expect(() => toCollectionParams({ when: new Date(Number.NaN) }, strict)).toThrow(
      /not a valid date/,
    )
    expect(() => toCollectionParams({ page: { n: 1 } }, strict)).toThrow(/must be text or a number/)
  })

  it('throws an AppError that says it is the filter, and is not worth retrying', () => {
    const error = (() => {
      try {
        return toCollectionParams({ range: { from: 1 } }, strict)
      } catch (thrown) {
        return thrown
      }
    })()

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'UNSERIALIZABLE_FILTER', retryable: false })
    // For the developer: the message is shown as it is, not a translation.
    expect((error as AppError).messageKey).toBeUndefined()
  })

  it('warns and sends the rest when told to', () => {
    const warned = extendDialect(strict, { query: { unserializable: 'warn' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(toCollectionParams({ page: 1, range: { from: 1 } }, warned)).toEqual({ page: '1' })

    warn.mockRestore()
  })

  it('warns once per filter, however often the list is asked for', () => {
    const resolved = resolveCollectionDialect(
      extendDialect(strict, { query: { unserializable: 'warn' } }),
    )

    resolved.toListQuery({ range: { from: 1 } })
    resolved.toListQuery({ range: { from: 2 } })
    resolved.toListQuery({ range: { from: 3 }, tags: [{ id: 1 }] })
    resolved.toListQuery({ tags: [{ id: 2 }] })

    expect(logged.warnings().filter((line) => line.includes('the filter "range"'))).toHaveLength(1)
    expect(logged.warnings().filter((line) => line.includes('the filter "tags"'))).toHaveLength(1)
    expect(logged.warnings()).toHaveLength(2)
  })

  it('builds the cache key without throwing or logging, and apart from the valid one', () => {
    const resolved = resolveCollectionDialect(strict)

    expect(resolved.listKey({ page: 1, status: 'open' })).toEqual({ page: '1', status: 'open' })
    // The same parameters the request would have sent, plus what was refused:
    // a list that failed on a filter is not the entry the fixed one finds.
    expect(resolved.listKey({ page: 1, range: { from: 1 } })).toEqual({
      page: '1',
      '!refused': ['range'],
    })
    expect(logged.warnings()).toEqual([])
  })

  it('keys a list under a dialect that drops or warns by what is sent', () => {
    const quiet = resolveCollectionDialect(dialects.vuestrata)
    const warned = resolveCollectionDialect(
      extendDialect(strict, { query: { unserializable: 'warn' } }),
    )

    expect(quiet.listKey({ page: 1, range: { from: 1 }, tags: ['a'] })).toEqual({ page: '1' })
    expect(warned.listKey({ page: 1, range: { from: 1 } })).toEqual({
      page: '1',
      '!refused': ['range'],
    })
    expect(logged.warnings()).toEqual([])
  })

  it('keys a list whose own toListQuery throws without throwing', () => {
    const own = resolveCollectionDialect({
      name: 'own',
      toListQuery: (filters) => {
        if ('bad' in filters) throw new Error('cannot write "bad"')
        return { q: JSON.stringify(filters) }
      },
      parseList: () => null,
    })

    expect(own.listKey({ page: 2 })).toEqual({ q: '{"page":2}' })
    expect(own.listKey({ bad: 1 })).toEqual({ unserializable: true, filters: { bad: 1 } })
    expect(() => own.toListQuery({ bad: 1 })).toThrow('cannot write "bad"')
  })

  it.each([
    [
      'the page size under Spring',
      dialects.spring,
      { page: 2, pageSize: 10, size: 'L' },
      { page: '1', size: '10' },
      ['size'],
    ],
    [
      'the page size under Laravel',
      dialects.laravel,
      { pageSize: 10, per_page: 9 },
      { per_page: '10' },
      ['per_page'],
    ],
    [
      'the page under Laravel, when it comes first',
      dialects.laravel,
      { page: 'x', pageSize: 10 },
      { page: 'x', per_page: '10' },
      [],
    ],
    [
      'the offset and the limit under DRF',
      dialects.drfLimitOffset,
      { page: 2, pageSize: 10, offset: 7, limit: 3 },
      { offset: '10', limit: '10' },
      ['offset', 'limit'],
    ],
    [
      'the sort under Spring',
      dialects.spring,
      { sortBy: 'name', sort: 'price' },
      { sort: ['name,asc'] },
      ['sort'],
    ],
    [
      'the sort under Laravel, with no sort asked for',
      dialects.laravel,
      { sort: 'price' },
      {},
      ['sort'],
    ],
    [
      'the ordering under DRF',
      dialects.drf,
      { ordering: '-price', sortBy: 'name' },
      { ordering: 'name' },
      ['ordering'],
    ],
    ['the search', dialects.drf, { search: 'ada', q: 'x' }, { search: 'ada', q: 'x' }, []],
    [
      'the cursor of a cursor dialect',
      extendDialect(dialects.drfCursor, { query: { cursor: 'after' } }),
      { after: 'abc', pageSize: 5 },
      { page_size: '5' },
      ['after'],
    ],
    [
      'the sort a function writes',
      dialects.nestPaginate,
      { sortBy: 'name', status: 'open' },
      { sortBy: ['name:ASC'], 'filter.status': 'open' },
      [],
    ],
    [
      'a list filter in brackets',
      extendDialect(dialects.laravel, { query: { pageSize: 'size[]' } }),
      { pageSize: 10, size: ['S', 'M'] },
      { 'size[]': '10' },
      ['size'],
    ],
    [
      'what a serializer returns',
      extendDialect(dialects.spring, {
        query: { serialize: { made: () => ({ page: 9, made_from: 'a' }) } },
      }),
      { page: 1, made: { from: 'a' } },
      { page: '0', made_from: 'a' },
      ['made'],
    ],
  ] as const)(
    'does not let a filter replace %s: the dialect’s own parameter wins',
    (_, dialect, filters, sent, refusedNames) => {
      const resolved = resolveCollectionDialect(
        extendDialect(dialect, { query: { unserializable: 'warn' } }),
      )

      expect(resolved.toListQuery(filters)).toEqual(sent)

      expect(logged.warnings()).toHaveLength(refusedNames.length)
      for (const [index, name] of refusedNames.entries()) {
        expect(logged.warnings()[index]).toContain(
          `cannot send the filter "${name}": it would be sent as`,
        )
      }

      // In development it fails the list instead of sending something else.
      if (refusedNames.length > 0) {
        expect(() => toCollectionParams(filters, dialect)).toThrow(
          /this dialect's \w[\w ]* parameter/,
        )
      }
    },
  )

  it('leaves the default dialect exactly as it was: nothing there can collide', () => {
    const filters = {
      page: 2,
      pageSize: 10,
      size: 'L',
      per_page: 9,
      limit: 3,
      sort: 'x',
      cursor: 'c',
    }

    expect(toCollectionParams(filters, dialects.vuestrata)).toEqual(toQueryParams(filters))
  })

  it('counts a page below the first as the first, under a zero-based dialect', () => {
    expect(toCollectionParams({ page: 0, pageSize: 10 }, dialects.spring)).toEqual({
      page: '0',
      size: '10',
    })
    expect(toCollectionParams({ page: -3 }, dialects.spring)).toEqual({ page: '0' })
    expect(toCollectionParams({ page: 1 }, dialects.spring)).toEqual({ page: '0' })
  })

  it('gives a dialect’s own filter and sort names the name in the backend’s case', () => {
    const snakeNest = extendDialect(dialects.nestPaginate, { keys: 'camel' })

    expect(
      toCollectionParams(
        {
          sortBy: 'createdAt',
          sortOrder: 'asc',
          accountManager: 'U-1',
          userID: ['a', 'b'],
        },
        snakeNest,
      ),
    ).toEqual({
      sortBy: ['created_at:ASC'],
      'filter.account_manager': 'U-1',
      'filter.user_id': '$in:a,b',
    })
    expect(
      toCollectionParams(
        { sortBy: 'createdAt', accountManager: 'U-1' },
        defineCollectionDialect({
          name: 'own',
          keys: { wire: 'pascal' },
          query: {
            sort: '-field',
            filterName: (name) => `f[${name}]`,
            sortField: (field) => `s.${field}`,
          },
          parseList: () => null,
        }),
      ),
    ).toEqual({ sort: 's.CreatedAt', 'f[AccountManager]': 'U-1' })
  })

  it('says nothing when told to drop', () => {
    const quiet = extendDialect(strict, { query: { unserializable: 'drop' } })

    expect(toCollectionParams({ page: 1, range: { from: 1 } }, quiet)).toEqual({ page: '1' })
  })

  it('writes a date as an ISO string', () => {
    expect(toCollectionParams({ since: new Date('2026-03-01T10:00:00.000Z') }, strict)).toEqual({
      since: '2026-03-01T10:00:00.000Z',
    })
  })

  it('writes an object through a serializer for that filter', () => {
    const ranged = extendDialect(strict, {
      query: {
        serialize: {
          created: (value) => {
            const range = value as { from?: string; to?: string }
            return { created_after: range.from, created_before: range.to }
          },
        },
      },
    })

    expect(toCollectionParams({ created: { from: '2026-01-01' } }, ranged)).toEqual({
      created_after: '2026-01-01',
    })
  })

  it('writes an object through the general rule', () => {
    expect(bracketFilter({ from: 1, to: { day: 2 } }, 'created')).toEqual({
      'created[from]': 1,
      'created[to][day]': 2,
    })
    expect(flatFilter('_')({ from: 1, to: 2 }, 'created')).toEqual({
      created_from: 1,
      created_to: 2,
    })
    expect(bracketFilter('text', 'created')).toBeNull()
  })

  it('writes lists the three ways', () => {
    const tags = { tags: ['a', 'b'] }

    expect(
      toCollectionParams(tags, extendDialect(strict, { query: { arrays: 'repeat' } })),
    ).toEqual({ tags: ['a', 'b'] })
    expect(toCollectionParams(tags, extendDialect(strict, { query: { arrays: 'comma' } }))).toEqual(
      {
        tags: 'a,b',
      },
    )
    expect(
      toCollectionParams(tags, extendDialect(strict, { query: { arrays: 'brackets' } })),
    ).toEqual({ 'tags[]': ['a', 'b'] })
  })

  it('lets a dialect write the whole query itself', () => {
    const own = defineCollectionDialect({
      name: 'own',
      toListQuery: (filters) => ({ q: JSON.stringify(filters) }),
      parseList: () => null,
    })

    expect(toCollectionParams({ page: 2 }, own)).toEqual({ q: '{"page":2}' })
  })
})

describe('resolveCollectionDialect', () => {
  it('refuses something that is not a dialect', () => {
    expect(() => resolveCollectionDialect({} as CollectionDialect)).toThrow(TypeError)
    expect(() => resolveCollectionDialect(null as unknown as CollectionDialect)).toThrow(
      /Not a collection dialect/,
    )
    expect(() =>
      resolveCollectionDialect({ pageParam: 'page' } as unknown as CollectionDialect),
    ).toThrow(/Not a collection dialect/)
  })

  it('returns a resolved dialect as it is', () => {
    const resolved = resolveCollectionDialect(dialects.spring)

    expect(resolveCollectionDialect(resolved)).toBe(resolved)
    expect(resolved.spec).toBe(dialects.spring)
  })

  it('merges conventions field by field when extending', () => {
    const extended = resolveCollectionDialect(
      extendDialect(dialects.drf, { keys: 'camel', query: { arrays: 'comma' } }),
    )

    expect(extended.query).toMatchObject({
      page: 'page',
      pageSize: 'page_size',
      sortParam: 'ordering',
      arrays: 'comma',
    })
    expect(extended.keys).toEqual({ wire: 'snake' })
    expect(extended.paths.detail('/a', '1')).toBe('/a/1/')
  })
})

describe('key case', () => {
  it.each([
    ['contact_name', 'contactName'],
    ['ContactName', 'contactName'],
    ['CONTACT_NAME', 'contactName'],
    ['id', 'id'],
    ['ID', 'id'],
    ['URLValue', 'urlValue'],
    ['address_line_1', 'addressLine1'],
    ['_links', '_links'],
    ['_private_key', '_privateKey'],
    ['alreadyCamel', 'alreadyCamel'],
    // Not a name in either case: left as it is.
    ['@odata.count', '@odata.count'],
    ['first-name', 'first-name'],
    ['__proto__', '__proto__'],
    ['', ''],
  ])('reads %s as %s', (wire, app) => {
    expect(camelCase(wire)).toBe(app)
  })

  it.each([
    ['contactName', 'contact_name', 'ContactName'],
    ['id', 'id', 'Id'],
    ['userID', 'user_id', 'UserID'],
    ['htmlURLValue', 'html_url_value', 'HtmlURLValue'],
    ['addressLine1', 'address_line1', 'AddressLine1'],
    ['first-name', 'first-name', 'first-name'],
    ['snake_already', 'snake_already', 'snake_already'],
  ])('writes %s as %s and %s', (app, snake, pascal) => {
    expect(snakeCase(app)).toBe(snake)
    expect(pascalCase(app)).toBe(pascal)
  })

  it('renames a snake_case record, deep, into camelCase', () => {
    const wire = {
      id: 7,
      contact_name: 'Ada',
      billing_address: { postal_code: 'N1', address_lines: [{ line_text: 'x' }] },
      tags: ['keep_this_value'],
      created_at: '2026-01-01',
    }

    expect(keysToApp(wire, { wire: 'snake' })).toEqual({
      id: 7,
      contactName: 'Ada',
      billingAddress: { postalCode: 'N1', addressLines: [{ lineText: 'x' }] },
      tags: ['keep_this_value'],
      createdAt: '2026-01-01',
    })
  })

  it('renames a request body to snake_case or PascalCase', () => {
    const body = {
      contactName: 'Ada',
      billingAddress: { postalCode: 'N1' },
      lines: [{ unitPrice: 1 }],
    }

    expect(keysToWire(body, { wire: 'snake' })).toEqual({
      contact_name: 'Ada',
      billing_address: { postal_code: 'N1' },
      lines: [{ unit_price: 1 }],
    })
    expect(keysToWire(body, { wire: 'pascal' })).toEqual({
      ContactName: 'Ada',
      BillingAddress: { PostalCode: 'N1' },
      Lines: [{ UnitPrice: 1 }],
    })
  })

  it('leaves the keys of a dictionary alone, and renames the records under it', () => {
    const wire = {
      display_name: 'Bolt',
      translations: { pt_BR: { short_title: 'Parafuso' }, en_GB: { short_title: 'Bolt' } },
    }
    const keys = { wire: 'snake', dictionaries: ['translations'] } as const

    const app = keysToApp(wire, keys)

    expect(app).toEqual({
      displayName: 'Bolt',
      translations: { pt_BR: { shortTitle: 'Parafuso' }, en_GB: { shortTitle: 'Bolt' } },
    })
    expect(keysToWire(app, keys)).toEqual(wire)
  })

  it('leaves an opaque value exactly as it was sent', () => {
    const settings = { ui_theme: 'dark', nested: { some_key: [{ deep_key: 1 }] } }
    const wire = { id: 1, user_settings: settings, rows: [{ raw_payload: { a_b: 1 }, row_id: 2 }] }
    const keys = { wire: 'snake', opaque: ['userSettings', 'rows.*.rawPayload'] } as const

    const app = keysToApp(wire, keys) as { userSettings: unknown }

    expect(app).toEqual({
      id: 1,
      userSettings: settings,
      rows: [{ rawPayload: { a_b: 1 }, rowId: 2 }],
    })
    expect(app.userSettings).toBe(settings)
    expect(keysToWire(app, keys)).toEqual(wire)
  })

  it('uses a given name in both directions where the case rule gets it wrong', () => {
    const keys = { wire: 'snake', names: { addressLine1: 'address_line_1' } } as const

    expect(keysToWire({ addressLine1: 'x' }, keys)).toEqual({ address_line_1: 'x' })
    expect(keysToApp({ address_line_1: 'x' }, keys)).toEqual({ addressLine1: 'x' })
  })

  it('renames into plain objects only', () => {
    const when = new Date(0)
    class Money {
      minor_units = 5
    }
    const money = new Money()

    const app = keysToApp({ created_at: when, unit_price: money, n: null }, { wire: 'snake' })

    expect(app).toEqual({ createdAt: when, unitPrice: money, n: null })
    expect((app as { unitPrice: unknown }).unitPrice).toBe(money)
    expect(keysToApp('text', { wire: 'snake' })).toBe('text')
    expect(keysToApp(null, { wire: 'snake' })).toBeNull()
  })

  it('keeps a key named __proto__ a key, and pollutes nothing', () => {
    const wire = JSON.parse(
      '{"__proto__": {"is_admin": true}, "constructor": {"a_b": 1}}',
    ) as object

    const app = keysToApp(wire, { wire: 'snake' }) as Record<string, unknown>

    expect(Object.keys(app)).toEqual(['__proto__', 'constructor'])
    expect(Object.getPrototypeOf(app)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(app, 'constructor')?.value).toEqual({ aB: 1 })
  })

  it('stops renaming past a depth no payload reaches, instead of overflowing', () => {
    let deep: Record<string, unknown> = { leaf_key: 1 }
    for (let level = 0; level < 5_000; level += 1) deep = { next_level: deep }

    expect(() => keysToApp(deep, { wire: 'snake' })).not.toThrow()
  })

  it('hands a cycle back as it is, at once, for JSON to refuse', () => {
    // Two references to itself: bounded by depth alone, this is 2^64 visits.
    const body: Record<string, unknown> = { firstName: 'Ada' }
    body.selfOne = body
    body.selfTwo = body
    const list: unknown[] = [{ line_text: 'x' }]
    list.push(list, list)

    const started = Date.now()
    const wire = keysToWire(body, { wire: 'snake' }) as Record<string, unknown>
    const app = keysToApp({ line_items: list }, { wire: 'snake' }) as { lineItems: unknown[] }

    expect(Date.now() - started).toBeLessThan(1_000)
    expect(wire.first_name).toBe('Ada')
    expect(wire.self_one).toBe(body)
    expect(wire.self_two).toBe(body)
    expect(() => JSON.stringify(wire)).toThrow(/circular/i)
    expect(app.lineItems[0]).toEqual({ lineText: 'x' })
    expect(app.lineItems[1]).toBe(list)
  })

  it('renames a value that is met twice without being its own ancestor', () => {
    const shared = { postal_code: 'N1' }

    expect(
      keysToApp({ billing_address: shared, shipping_address: shared }, { wire: 'snake' }),
    ).toEqual({ billingAddress: { postalCode: 'N1' }, shippingAddress: { postalCode: 'N1' } })
  })

  it.each([
    // From the app: the schema's field does not come back as itself.
    ['userID', 'app', 'snake', { app: 'userID', wire: 'user_id', back: 'userId' }],
    ['homeURL', 'app', 'snake', { app: 'homeURL', wire: 'home_url', back: 'homeUrl' }],
    [
      'is2FAEnabled',
      'app',
      'snake',
      { app: 'is2FAEnabled', wire: 'is2_fa_enabled', back: 'is2FaEnabled' },
    ],
    // From the wire: what was read is not written back as it was.
    [
      'address_line_1',
      'wire',
      'snake',
      { app: 'addressLine1', wire: 'address_line_1', back: 'address_line1' },
    ],
    ['URL', 'wire', 'pascal', { app: 'url', wire: 'URL', back: 'Url' }],
    ['HTTPStatus', 'wire', 'pascal', { app: 'httpStatus', wire: 'HTTPStatus', back: 'HttpStatus' }],
    ['SKU', 'wire', 'pascal', { app: 'sku', wire: 'SKU', back: 'Sku' }],
    // A backend that mixes cases: the odd one out needs its name too.
    ['createdAt', 'wire', 'snake', { app: 'createdAt', wire: 'createdAt', back: 'created_at' }],
    ['contactName', 'app', 'snake', null],
    ['contact_name', 'wire', 'snake', null],
    ['ContactName', 'wire', 'pascal', null],
    ['id', 'app', 'pascal', null],
    ['@odata.count', 'wire', 'snake', null],
  ] as const)(
    'says whether %s survives the round trip from the %s',
    (key, from, wire, expected) => {
      expect(unstableKey(key, from, { wire })).toEqual(expected)
    },
  )

  it('finds every unstable key stable once its name is given', () => {
    const keys = {
      wire: 'snake',
      names: { userID: 'user_id', addressLine1: 'address_line_1' },
    } as const

    expect(unstableKey('userID', 'app', keys)).toBeNull()
    expect(unstableKey('user_id', 'wire', keys)).toBeNull()
    expect(unstableKey('addressLine1', 'app', keys)).toBeNull()
    expect(unstableKey('address_line_1', 'wire', keys)).toBeNull()
    expect(keysToApp({ user_id: 1, address_line_1: 'x' }, keys)).toEqual({
      userID: 1,
      addressLine1: 'x',
    })
  })

  it('reports keys that are read as the same name, and never their values', () => {
    const collision = vi.fn()
    const renamed = vi.fn()

    const app = keysToApp(
      { user_id: 111, userId: 222, UserId: 333, nested: [{ a_b: 444, aB: 555 }], fine_key: true },
      { wire: 'snake' },
      undefined,
      { collision, renamed },
    )

    // The last one wins: unchanged, and now said.
    expect(app).toEqual({ userId: 333, nested: [{ aB: 555 }], fineKey: true })
    expect(collision.mock.calls).toEqual([
      ['aB', ['a_b', 'aB']],
      ['userId', ['user_id', 'userId', 'UserId']],
    ])
    expect(renamed.mock.calls).toContainEqual(['fine_key', 'fineKey'])
    expect(JSON.stringify([collision.mock.calls, renamed.mock.calls])).not.toMatch(
      /111|222|333|444|555|true/,
    )
  })

  it('does not look for collisions among the keys of a dictionary', () => {
    const collision = vi.fn()

    keysToApp(
      { labels: { a_b: 1, aB: 2 } },
      { wire: 'snake', dictionaries: ['labels'] },
      undefined,
      { collision },
    )

    expect(collision).not.toHaveBeenCalled()
  })
})

describe('schemaKeyPlan', () => {
  it('finds the dictionaries and the opaque fields a schema declares', () => {
    const schema = z.object({
      id: z.string(),
      // Values are not objects: nothing under it is a record to rename.
      labels: z.record(z.string(), z.string()),
      // Values are records: the keys are data, what is under them is not.
      translations: z.record(z.string(), z.object({ shortTitle: z.string() })).optional(),
      settings: z.unknown(),
      anything: z.any().nullable(),
      lines: z.array(z.object({ attributes: z.record(z.string(), z.number()).nullable() })),
      choice: z.union([z.object({ payload: z.unknown() }), z.object({ other: z.string() })]),
      address: z.object({ extra: z.record(z.string(), z.unknown()) }).default({ extra: {} }),
    })

    expect(schemaKeyPlan(schema)).toEqual({
      opaque: [
        'labels',
        'settings',
        'anything',
        'lines.*.attributes',
        'choice.payload',
        'address.extra',
      ],
      dictionaries: ['translations'],
      fields: [
        'id',
        'labels',
        'translations',
        'shortTitle',
        'settings',
        'anything',
        'lines',
        'attributes',
        'choice',
        'payload',
        'other',
        'address',
        'extra',
      ],
    })
  })

  it('sees a record behind z.preprocess, and a transform after a schema', () => {
    const schema = z.object({
      prices: z.preprocess((value) => value ?? {}, z.record(z.string(), z.number())),
      totals: z.record(z.string(), z.number()).transform((value) => Object.entries(value)),
      owner: z.preprocess((value) => value, z.object({ fullName: z.string() })),
    })

    expect(schemaKeyPlan(schema)).toEqual({
      opaque: ['prices', 'totals'],
      dictionaries: [],
      fields: ['prices', 'totals', 'owner', 'fullName'],
    })
  })

  it('reads a schema that is itself a record as a dictionary from the top', () => {
    const byLocale = z.record(z.string(), z.object({ shortTitle: z.string() }))
    const counts = z.record(z.string(), z.number())
    const wire = { pt_BR: { short_title: 'Parafuso' }, en_GB: { short_title: 'Bolt' } }

    expect(schemaKeyPlan(byLocale)).toEqual({
      opaque: [],
      dictionaries: [''],
      fields: ['shortTitle'],
    })
    expect(schemaKeyPlan(counts)).toEqual({ opaque: [''], dictionaries: [], fields: [] })

    const app = keysToApp(wire, { wire: 'snake' }, schemaKeyPlan(byLocale))
    expect(app).toEqual({ pt_BR: { shortTitle: 'Parafuso' }, en_GB: { shortTitle: 'Bolt' } })
    expect(keysToWire(app, { wire: 'snake' }, schemaKeyPlan(byLocale))).toEqual(wire)
    // Data from its first key down: nothing in it is a field name.
    const tallies = { open_orders: 3, late_orders: 1 }
    expect(keysToApp(tallies, { wire: 'snake' }, schemaKeyPlan(counts))).toBe(tallies)
  })

  it('makes a schema-declared dictionary survive the round trip', () => {
    const schema = z.object({
      displayName: z.string(),
      prices: z.record(z.string(), z.number()),
      translations: z.record(z.string(), z.object({ shortTitle: z.string() })),
    })
    const wire = {
      display_name: 'Bolt',
      prices: { eur_cents: 1200, usd_cents: 1300 },
      translations: { pt_BR: { short_title: 'Parafuso' } },
    }
    const plan = schemaKeyPlan(schema)

    const app = keysToApp(wire, { wire: 'snake' }, plan)

    expect(schema.parse(app)).toEqual({
      displayName: 'Bolt',
      prices: { eur_cents: 1200, usd_cents: 1300 },
      translations: { pt_BR: { shortTitle: 'Parafuso' } },
    })
    expect(keysToWire(app, { wire: 'snake' }, plan)).toEqual(wire)
  })

  it('stops at a recursive schema', () => {
    interface Node {
      nodeName: string
      children: Node[]
    }
    const node: z.ZodType<Node> = z.object({
      nodeName: z.string(),
      get children() {
        return z.array(node)
      },
    })

    expect(schemaKeyPlan(node)).toEqual({
      opaque: [],
      dictionaries: [],
      fields: ['nodeName', 'children'],
    })
    // JSON is data from top to bottom, as a whole payload and as a column.
    expect(schemaKeyPlan(z.json())).toEqual({ opaque: [''], dictionaries: [], fields: [] })
    expect(schemaKeyPlan(z.object({ payload: z.json() }))).toEqual({
      opaque: ['payload'],
      dictionaries: [],
      fields: ['payload'],
    })
  })

  it('yields an empty plan for what is not a zod schema', () => {
    const empty = { opaque: [], dictionaries: [], fields: [] }

    expect(schemaKeyPlan(null)).toEqual(empty)
    expect(schemaKeyPlan({ parse: () => 1 })).toEqual(empty)
  })
})

describe('unwrapData', () => {
  it('takes the record out of a { data } envelope', () => {
    expect(unwrapData({ data: { id: 1 } })).toEqual({ id: 1 })
    expect(unwrapData({ data: { id: 1 }, meta: { took: 3 } })).toEqual({ id: 1 })
  })

  it('leaves a record with its own id and a field called data alone', () => {
    const record = { id: 1, data: { payload: true } }

    expect(unwrapData(record)).toBe(record)
  })

  it('leaves anything else alone', () => {
    expect(unwrapData({ data: [1, 2] })).toEqual({ data: [1, 2] })
    expect(unwrapData({ id: 1 })).toEqual({ id: 1 })
    expect(unwrapData(null)).toBeNull()
    expect(unwrapData('')).toBe('')
  })
})
