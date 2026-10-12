import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'

import { installApiAuth } from '@/lib/api/client'
import { AppError } from '@/lib/errors'
import { appEvents } from '@/lib/events'
import { useUpdateRoleMutation } from '@/modules/users/composables/useUpdateRoleMutation'
import { usersModuleKeys } from '@/modules/users/query-keys'
import type { User } from '@/types'

import { withQueryClient } from '../../utils/query-client'

/**
 * `PATCH /users/{id}/role` through the validated action helper, on the wire.
 * The mutation used to be a bare `apiPatch<User>()`: whatever came back was
 * called a `User`.
 */

const server = setupServer()
const wire: { request: string; body: unknown }[] = []

const user: User = { id: 'u1', email: 'u1@example.test', name: 'User One', role: 'member' }

function recordWire() {
  server.use(
    http.all('*/api/*', async ({ request }) => {
      const text = await request.clone().text()
      wire.push({
        request: `${request.method} ${new URL(request.url).pathname}`,
        body: text === '' ? null : JSON.parse(text),
      })
    }),
  )
}

function mounted() {
  return withQueryClient((client) => ({
    mutation: useUpdateRoleMutation(),
    queryClient: client,
    invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
  }))
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  wire.length = 0
  installApiAuth({
    getToken: () => 'session-token',
    getRefreshToken: () => null,
    setAuth: () => {},
    clearAuth: () => {},
  })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('useUpdateRoleMutation', () => {
  it('patches the role, returns the user, invalidates the lists and says what changed', async () => {
    server.use(
      http.patch('*/api/users/:id/role', () =>
        HttpResponse.json({ ...user, role: 'admin', lastLoginAt: '2026-01-01T00:00:00Z' }),
      ),
    )
    recordWire()
    const changed = vi.fn()
    const off = appEvents.on('user.role_changed', changed)
    const { mutation, queryClient, invalidateQueries } = mounted()
    // The role the user holds now is read from whichever list has them.
    queryClient.setQueryData(usersModuleKeys.list({ page: 1 }), { data: [user], meta: null })

    const updated = await mutation.updateRole('u1', 'admin')
    off()

    expect(wire).toEqual([{ request: 'PATCH /api/users/u1/role', body: { role: 'admin' } }])
    // The fields the schema does not name are passed on.
    expect(updated).toEqual({ ...user, role: 'admin', lastLoginAt: '2026-01-01T00:00:00Z' })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] })
    expect(changed).toHaveBeenCalledWith({ userId: 'u1', oldRole: 'member', newRole: 'admin' })
  })

  it('fails an answer that is not a user, instead of calling it one', async () => {
    server.use(http.patch('*/api/users/:id/role', () => HttpResponse.json({ ok: true })))
    const changed = vi.fn()
    const off = appEvents.on('user.role_changed', changed)
    const { mutation, invalidateQueries } = mounted()

    const error: unknown = await mutation.updateRole('u1', 'admin').then(
      () => undefined,
      (reason: unknown) => reason,
    )
    off()

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    expect(Object.keys((error as AppError).details ?? {})).toEqual(['id', 'email', 'name', 'role'])
    expect(changed).not.toHaveBeenCalled()
    // The role may have changed all the same: the lists are refreshed.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('passes a refusal on, and announces nothing', async () => {
    server.use(
      http.patch('*/api/users/:id/role', () =>
        HttpResponse.json({ message: 'Only an owner can do that' }, { status: 403 }),
      ),
    )
    const changed = vi.fn()
    const off = appEvents.on('user.role_changed', changed)
    const { mutation } = mounted()

    await expect(mutation.updateRole('u1', 'admin')).rejects.toMatchObject({
      status: 403,
      kind: 'http',
    })
    off()

    expect(changed).not.toHaveBeenCalled()
  })
})
