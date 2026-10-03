import { describe, expect, it, vi } from 'vite-plus/test'
import { ref } from 'vue'
import { z } from 'zod'

import { useServerTable } from '@/composables/useServerTable'
import {
  createCollectionApi,
  type CollectionFilters,
  type CollectionSourceContext,
} from '@/lib/api/collection-queries'
import { AppError, isNotFoundError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'

import { withQueryClient } from '../../utils/query-client'

/**
 * A collection that is not a REST endpoint: `createCollectionApi({ source })`
 * over a fake SDK, shaped like the ones a backend-as-a-service ships. Nothing
 * here reaches the network, which is the point: the same composables, the
 * same validation and the same errors, from five functions.
 */

// ─── The SDK: rows in its own shape, results as { data, count, error } ──────

interface SdkRow {
  id: number
  full_name: string
  team_role: string
}

interface SdkError {
  message: string
  code: string
}

interface SdkQuery {
  ilike?: string
  equals?: Partial<Record<keyof SdkRow, string>>
  order?: { column: keyof SdkRow; ascending: boolean }
  range?: [from: number, to: number]
  signal?: AbortSignal
}

function createFakeSdk(seed: SdkRow[]) {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]))
  const state = { calls: [] as string[], nextId: 100, failWith: null as unknown }

  /** Every call takes a tick, and gives up when its signal aborts. */
  async function settle(signal?: AbortSignal) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
    if (state.failWith !== null) throw state.failWith
  }

  return {
    state,
    members: {
      async select(query: SdkQuery): Promise<{ data: SdkRow[]; count: number }> {
        state.calls.push(`select ${JSON.stringify({ ...query, signal: undefined })}`)
        await settle(query.signal)
        const found = [...rows.values()]
          .filter((row) => !query.ilike || row.full_name.toLowerCase().includes(query.ilike))
          .filter((row) =>
            Object.entries(query.equals ?? {}).every(
              ([column, value]) => String(row[column as keyof SdkRow]) === value,
            ),
          )
        const { order } = query
        if (order) {
          found.sort(
            (a, b) =>
              String(a[order.column]).localeCompare(String(b[order.column])) *
              (order.ascending ? 1 : -1),
          )
        }
        const [from, to] = query.range ?? [0, found.length - 1]
        return { data: found.slice(from, to + 1), count: found.length }
      },
      async byId(id: number, signal?: AbortSignal): Promise<SdkRow | null> {
        state.calls.push(`byId ${id}`)
        await settle(signal)
        return rows.get(id) ?? null
      },
      async insert(row: Omit<SdkRow, 'id'>): Promise<SdkRow> {
        state.calls.push(`insert ${JSON.stringify(row)}`)
        await settle()
        const created = { id: (state.nextId += 1), ...row }
        rows.set(created.id, created)
        return created
      },
      /** Like many SDKs: an update answers with nothing. */
      async update(id: number, patch: Partial<SdkRow>): Promise<void> {
        state.calls.push(`update ${id} ${JSON.stringify(patch)}`)
        await settle()
        const current = rows.get(id)
        if (!current) throw { message: 'Row not found', code: 'PGRST116' } satisfies SdkError
        rows.set(id, { ...current, ...patch })
      },
      async delete(id: number): Promise<void> {
        state.calls.push(`delete ${id}`)
        await settle()
        rows.delete(id)
      },
    },
  }
}

// ─── The app's side ─────────────────────────────────────────────────────────

interface Member {
  id: string
  name: string
  role: string
}

interface MemberFilters extends CollectionFilters {
  role?: string
}

type MemberDraft = Omit<Member, 'id'>

const memberSchema: z.ZodType<Member> = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
})

const memberKeys = defineQueryKeys('members')

const toMember = (row: SdkRow | null) =>
  row && { id: String(row.id), name: row.full_name, role: row.team_role }

const seed: SdkRow[] = [
  { id: 1, full_name: 'Ada Lovelace', team_role: 'admin' },
  { id: 2, full_name: 'Grace Hopper', team_role: 'member' },
  { id: 3, full_name: 'Edsger Dijkstra', team_role: 'member' },
  { id: 4, full_name: 'Barbara Liskov', team_role: 'member' },
  { id: 5, full_name: 'Alan Kay', team_role: 'admin' },
]

function createMembers(sdk = createFakeSdk(seed)) {
  const api = createCollectionApi({
    schema: memberSchema,
    keys: memberKeys,
    source: {
      async list(filters: MemberFilters, { signal }: CollectionSourceContext) {
        const page = filters.page ?? 1
        const pageSize = filters.pageSize ?? 10
        const { data, count } = await sdk.members.select({
          ilike: filters.search?.toLowerCase(),
          equals: filters.role ? { team_role: filters.role } : undefined,
          order: filters.sortBy
            ? {
                column: filters.sortBy === 'name' ? 'full_name' : 'team_role',
                ascending: filters.sortOrder !== 'desc',
              }
            : undefined,
          range: [(page - 1) * pageSize, page * pageSize - 1],
          signal,
        })
        return { items: data.map(toMember), total: count }
      },
      // The context needs no annotation: it is typed by the source's own shape.
      get: async (id: string, { signal }) => toMember(await sdk.members.byId(Number(id), signal)),
      create: async (draft: MemberDraft) =>
        toMember(await sdk.members.insert({ full_name: draft.name, team_role: draft.role })),
      update: (id: string, patch: Partial<MemberDraft>) =>
        sdk.members.update(Number(id), {
          ...(patch.name === undefined ? {} : { full_name: patch.name }),
          ...(patch.role === undefined ? {} : { team_role: patch.role }),
        }),
      remove: (id: string) => sdk.members.delete(Number(id)),
    },
  })
  return { api, sdk }
}

async function settled(...queries: { isPending: { value: boolean } }[]) {
  await vi.waitFor(
    () => {
      for (const query of queries) expect(query.isPending.value).toBe(false)
    },
    { timeout: 5_000 },
  )
}

describe('a collection over an SDK', () => {
  it('lists through the source, with the page counts worked out from its total', async () => {
    const { api, sdk } = createMembers()
    const { list, queryClient } = withQueryClient((client) => ({
      list: api.useList(
        ref<MemberFilters>({
          page: 2,
          pageSize: 2,
          sortBy: 'name',
          sortOrder: 'asc',
          // A cleared select and an unset search never reach the source.
          role: 'all',
          search: '',
        }),
      ),
      queryClient: client,
    }))
    await settled(list)

    expect(sdk.state.calls).toEqual([
      'select {"order":{"column":"full_name","ascending":true},"range":[2,3]}',
    ])
    expect(list.items.value).toEqual([
      { id: '4', name: 'Barbara Liskov', role: 'member' },
      { id: '3', name: 'Edsger Dijkstra', role: 'member' },
    ])
    expect(list.meta.value).toEqual({ total: 5, page: 2, pageSize: 2, totalPages: 3 })
    // Cached like any collection: under its keys, by the filters that are set.
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['members', 'list', { page: 2, pageSize: 2, sortBy: 'name', sortOrder: 'asc' }]])
  })

  it('reads one record, and nothing until it has an id', async () => {
    const { api, sdk } = createMembers()
    const id = ref<string | undefined>(undefined)
    const detail = withQueryClient(() => api.useDetail(id))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sdk.state.calls).toEqual([])

    id.value = '2'
    await settled(detail)

    expect(detail.item.value).toEqual({ id: '2', name: 'Grace Hopper', role: 'member' })
  })

  it('reads a record the source does not have as a 404, as a REST backend answers', async () => {
    const { api } = createMembers()
    const detail = withQueryClient(() => api.useDetail('999'))

    await vi.waitFor(() => expect(detail.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(detail.error.value).toBeInstanceOf(AppError)
    expect(detail.error.value).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      kind: 'http',
      retryable: false,
      messageKey: 'errors.status_404',
    })
    // What every record page asks, to show "not found" instead of "retry".
    expect(isNotFoundError(detail.error.value)).toBe(true)
  })

  it('creates, updates and removes, invalidating the collection each time', async () => {
    const { api, sdk } = createMembers()
    const { invalidateQueries, ...mutations } = withQueryClient((client) => ({
      create: api.useCreate(),
      update: api.useUpdate(),
      remove: api.useRemove(),
      invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
    }))

    const created = await mutations.create.mutateAsync({ name: 'Radia Perlman', role: 'member' })
    // The SDK's update answers with nothing: the record is read back.
    const updated = await mutations.update.mutateAsync({ id: '2', patch: { role: 'admin' } })
    await expect(mutations.remove.mutateAsync('3')).resolves.toBeUndefined()

    expect(created).toEqual({ id: '101', name: 'Radia Perlman', role: 'member' })
    expect(updated).toEqual({ id: '2', name: 'Grace Hopper', role: 'admin' })
    expect(sdk.state.calls).toEqual([
      'insert {"full_name":"Radia Perlman","team_role":"member"}',
      'update 2 {"team_role":"admin"}',
      'byId 2',
      'delete 3',
    ])
    expect(invalidateQueries).toHaveBeenCalledTimes(3)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['members'] })
  })

  it('validates what the source hands back, row by row', async () => {
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: {
        list: () => ({ items: [{ id: '1', name: 'Ada', role: 'admin' }, { id: 2 }], total: 2 }),
        get: () => ({ id: '1', name: 7 }),
      },
    })
    const { list, detail } = withQueryClient(() => ({
      list: api.useList(ref({})),
      detail: api.useDetail('1'),
    }))

    await vi.waitFor(
      () => {
        expect(list.error.value).toBeTruthy()
        expect(detail.error.value).toBeTruthy()
      },
      { timeout: 5_000 },
    )

    expect(list.error.value).toBeInstanceOf(AppError)
    expect(list.error.value).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    expect(Object.keys((list.error.value as AppError).details ?? {})).toEqual([
      'data.1.id',
      'data.1.name',
      'data.1.role',
    ])
    expect(Object.keys((detail.error.value as AppError).details ?? {})).toEqual(['name', 'role'])
  })

  it('takes a bare array as everything there is', async () => {
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: { list: () => seed.map(toMember), get: () => null },
    })
    const list = withQueryClient(() => api.useList(ref({})))
    await settled(list)

    expect(list.items.value).toHaveLength(5)
    expect(list.meta.value).toEqual({ total: 5, page: 1, pageSize: 5, totalPages: 1 })
  })

  it('takes the page meta as the source gives it', async () => {
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: {
        list: () => ({
          items: [toMember(seed[0]!)],
          meta: { total: 41, page: 3, pageSize: 20, totalPages: 3 },
        }),
        get: () => null,
      },
    })
    const list = withQueryClient(() => api.useList(ref({})))
    await settled(list)

    expect(list.meta.value).toEqual({ total: 41, page: 3, pageSize: 20, totalPages: 3 })
  })

  it('fails as a contract mismatch when the source answers with no list at all', async () => {
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: { list: () => undefined, get: () => null },
    })
    const list = withQueryClient(() => api.useList(ref({})))

    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({ code: 'CONTRACT_MISMATCH' })
    expect(Object.keys((list.error.value as AppError).details ?? {})).toEqual(['(root)'])
  })

  it('aborts the SDK call when the list is no longer wanted', async () => {
    const seen: { signal?: AbortSignal } = {}
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: {
        list: (_filters: MemberFilters, { signal }: CollectionSourceContext) => {
          seen.signal = signal
          return new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            )
          })
        },
        get: () => null,
      },
    })
    const { queryClient } = withQueryClient((client) => ({
      list: api.useList(ref({})),
      queryClient: client,
    }))
    await vi.waitFor(() => expect(seen.signal).toBeDefined(), { timeout: 5_000 })
    expect(seen.signal?.aborted).toBe(false)

    await queryClient.cancelQueries({ queryKey: memberKeys.all })

    expect(seen.signal?.aborted).toBe(true)
  })

  it('turns an abort the SDK reports into the aborted error the app knows', async () => {
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: {
        list: () => {
          throw new DOMException('The operation was aborted.', 'AbortError')
        },
        get: () => null,
      },
    })
    const list = withQueryClient(() => api.useList(ref({})))

    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({ kind: 'aborted', code: 'ABORTED' })
  })

  it.each([
    [
      'an error object, as Supabase gives one',
      { message: 'JWT expired', code: 'PGRST301', details: null, hint: null },
      { message: 'JWT expired', code: 'PGRST301', status: 500, kind: 'unknown' },
    ],
    [
      'an error object with a status',
      { message: 'Missing or insufficient permissions.', status: 403 },
      { message: 'Missing or insufficient permissions.', code: 'SOURCE_ERROR', status: 403 },
    ],
    [
      'an Error',
      new Error('offline persistence is not enabled'),
      { message: 'offline persistence is not enabled', code: 'RUNTIME_ERROR', kind: 'unknown' },
    ],
    [
      // Firebase's errors are `Error`s that say what happened in `code`.
      'an Error with a code, as Firebase gives one',
      Object.assign(new Error('Missing or insufficient permissions.'), {
        name: 'FirebaseError',
        code: 'permission-denied',
      }),
      {
        message: 'Missing or insufficient permissions.',
        code: 'permission-denied',
        status: 403,
        kind: 'unknown',
        messageKey: 'errors.status_403',
      },
    ],
    [
      'an Error with a code under a service, as Firebase Storage gives one',
      Object.assign(new Error('Object does not exist.'), { code: 'storage/object-not-found' }),
      { code: 'storage/object-not-found', status: 404, messageKey: 'errors.status_404' },
    ],
    [
      'an Error subclass with a code and no status, as a PostgrestError is',
      new (class PostgrestError extends Error {
        code = 'PGRST301'
        details = null
        hint = null
      })('JWT expired'),
      { message: 'JWT expired', code: 'PGRST301', status: 500, messageKey: 'errors.unknown' },
    ],
    [
      'an Error with a status',
      Object.assign(new Error('Row not found'), { status: 404 }),
      { message: 'Row not found', code: 'RUNTIME_ERROR', status: 404 },
    ],
    [
      'an Error whose code is the status',
      Object.assign(new Error('Document not found'), { code: 404, type: 'document_not_found' }),
      { message: 'Document not found', code: 'RUNTIME_ERROR', status: 404 },
    ],
    [
      'an error object with a code that names a status',
      { message: 'Sign in again.', code: 'unauthenticated' },
      { code: 'unauthenticated', status: 401, messageKey: 'errors.status_401' },
    ],
    [
      'an Error that quotes a URL and carries a stack',
      Object.assign(
        new Error(
          'Request to https://xyz.example.co/rest/v1/members?apikey=secret-key failed\n' +
            '    at fetchRows (https://app.example/assets/sdk.js:1:2)',
        ),
        { code: 'unavailable' },
      ),
      { message: 'Request to [url] failed', code: 'unavailable', status: 503 },
    ],
    ['a string', 'quota exceeded', { message: 'quota exceeded', code: 'STRING_ERROR' }],
    ['nothing useful', 42, { code: 'UNKNOWN_ERROR', kind: 'unknown' }],
  ])('turns %s thrown by the SDK into an AppError', async (_, thrown, expected) => {
    const sdk = createFakeSdk(seed)
    sdk.state.failWith = thrown
    const { api } = createMembers(sdk)
    const { list, detail, create } = withQueryClient(() => ({
      list: api.useList(ref({})),
      detail: api.useDetail('1'),
      create: api.useCreate(),
    }))

    await vi.waitFor(
      () => {
        expect(list.error.value).toBeTruthy()
        expect(detail.error.value).toBeTruthy()
      },
      { timeout: 5_000 },
    )
    // Read now: the write below invalidates both queries, which then refetch.
    const readErrors = [list.error.value, detail.error.value]
    const writeError: unknown = await create.mutateAsync({ name: 'x', role: 'member' }).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    for (const error of [...readErrors, writeError]) {
      expect(error).toBeInstanceOf(AppError)
      expect(error).toMatchObject(expected)
      // Whatever the SDK put in its message, no address and no stack leave it.
      expect((error as AppError).message).not.toMatch(/https?:|secret-key|\n/)
    }
  })

  it('lets a record page tell an SDK’s "not found" from a failure', async () => {
    const sdk = createFakeSdk(seed)
    sdk.state.failWith = Object.assign(new Error('No document to update'), { code: 'not-found' })
    const { api } = createMembers(sdk)
    const detail = withQueryClient(() => api.useDetail('1'))

    await vi.waitFor(() => expect(detail.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(isNotFoundError(detail.error.value)).toBe(true)
    expect(detail.error.value).toMatchObject({ code: 'not-found', status: 404 })

    sdk.state.failWith = Object.assign(new Error('boom'), { code: 'internal' })
    const other = withQueryClient(() => api.useDetail('2'))
    await vi.waitFor(() => expect(other.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(isNotFoundError(other.error.value)).toBe(false)
    expect(other.error.value).toMatchObject({ code: 'internal', status: 500 })
  })

  it('has no mutation the source has no function for', () => {
    const readOnly = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: {
        list: (_filters: MemberFilters) => [],
        get: (_id: string) => null,
        remove: (_id: string) => undefined,
      },
    })

    expect(Object.keys(readOnly).sort()).toEqual([
      'useDetail',
      'useInfiniteList',
      'useList',
      'useRemove',
    ])
    // @ts-expect-error The source has no `create`, so the collection has no `useCreate`.
    expect(readOnly.useCreate).toBeUndefined()
    // @ts-expect-error Nor `useUpdate`.
    expect(readOnly.useUpdate).toBeUndefined()
    expect(readOnly.useRemove).toBeTypeOf('function')
  })

  it('drives a server table as a REST collection does', async () => {
    const { api, sdk } = createMembers()
    const table = withQueryClient(() =>
      useServerTable<Member, MemberFilters>({
        columns: [{ accessorKey: 'name', header: 'Name' }],
        query: api.useList,
        extra: () => ({ role: 'member' }),
        pageSize: 2,
      }),
    )
    await vi.waitFor(() => expect(table.items.value).toHaveLength(2), { timeout: 5_000 })

    expect(sdk.state.calls.at(-1)).toBe('select {"equals":{"team_role":"member"},"range":[0,1]}')
    expect(table.meta.value).toEqual({ total: 3, page: 1, pageSize: 2, totalPages: 2 })
    expect(table.table.getRowModel().rows.map((row) => row.original.name)).toEqual([
      'Grace Hopper',
      'Edsger Dijkstra',
    ])
    expect(table.table.getPageCount()).toBe(2)
  })
})

describe('a source read a page at a time', () => {
  it('loads more by page number when the source counts its rows', async () => {
    const { api, sdk } = createMembers()
    const feed = withQueryClient(() =>
      api.useInfiniteList(ref<MemberFilters>({ pageSize: 2, sortBy: 'name' })),
    )
    await settled(feed)

    expect(feed.items.value.map((member) => member.name)).toEqual(['Ada Lovelace', 'Alan Kay'])
    expect(feed.hasMore.value).toBe(true)
    expect(feed.total.value).toBe(5)

    feed.loadMore()
    await vi.waitFor(() => expect(feed.items.value).toHaveLength(4), { timeout: 5_000 })
    feed.loadMore()
    await vi.waitFor(() => expect(feed.items.value).toHaveLength(5), { timeout: 5_000 })

    expect(feed.hasMore.value).toBe(false)
    expect(sdk.state.calls.map((call) => /"range":\[\d+,\d+\]/.exec(call)?.[0])).toEqual([
      '"range":[0,1]',
      '"range":[2,3]',
      '"range":[4,5]',
    ])
    // Nothing more to ask for: this does nothing.
    feed.loadMore()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sdk.state.calls).toHaveLength(3)
  })

  it('loads more by cursor when the source answers with one', async () => {
    const asked: (string | undefined)[] = []
    const all = seed.map(toMember) as Member[]
    const api = createCollectionApi({
      schema: memberSchema,
      keys: memberKeys,
      source: {
        // Firestore-style: `startAfter(lastDocument)`, and no total.
        list: (filters: MemberFilters & { cursor?: string }) => {
          asked.push(filters.cursor)
          const start = filters.cursor ? all.findIndex((row) => row.id === filters.cursor) + 1 : 0
          const items = all.slice(start, start + 2)
          const last = start + 2 >= all.length
          return { items, meta: { nextCursor: last ? null : items.at(-1)?.id } }
        },
        get: () => null,
      },
    })
    const feed = withQueryClient(() => api.useInfiniteList(ref({})))
    await settled(feed)

    expect(feed.items.value.map((member) => member.id)).toEqual(['1', '2'])
    expect(feed.total.value).toBeUndefined()

    feed.loadMore()
    await vi.waitFor(() => expect(feed.items.value).toHaveLength(4), { timeout: 5_000 })
    expect(feed.hasMore.value).toBe(true)
    feed.loadMore()
    await vi.waitFor(() => expect(feed.items.value).toHaveLength(5), { timeout: 5_000 })

    expect(feed.hasMore.value).toBe(false)
    expect(asked).toEqual([undefined, '2', '4'])
  })
})
