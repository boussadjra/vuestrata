import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent } from 'vue'

import type { InviteUserPayload } from '@/modules/users/composables/useInviteUserMutation'
import { useInviteUserMutation } from '@/modules/users/composables/useInviteUserMutation'
import type { UpdatePermissionsPayload } from '@/modules/users/composables/useUpdatePermissionsMutation'
import { useUpdatePermissionsMutation } from '@/modules/users/composables/useUpdatePermissionsMutation'
import type { User } from '@/types'

const apiMocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}))

vi.mock('~/lib/api/client', () => ({
  apiPost: apiMocks.apiPost,
  apiPatch: apiMocks.apiPatch,
}))

vi.mock('~/lib/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

function mountComposable<T>(factory: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateQueries = vi
    .spyOn(queryClient, 'invalidateQueries')
    .mockResolvedValue(undefined as never)
  let result!: T
  const Harness = defineComponent({
    setup() {
      result = factory()
      return () => null
    },
  })

  mount(Harness, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })

  return { result, invalidateQueries }
}

const user: User = {
  id: 'u1',
  email: 'u1@example.test',
  name: 'User One',
  role: 'member',
  emailVerified: false,
}

interface UserMutationTestGlobals {
  __vuestrata_apiPost?: typeof apiMocks.apiPost
  __vuestrata_apiPatch?: typeof apiMocks.apiPatch
}

beforeEach(() => {
  apiMocks.apiPost.mockReset()
  apiMocks.apiPatch.mockReset()
})

beforeEach(() => {
  const g = globalThis as typeof globalThis & UserMutationTestGlobals
  g.__vuestrata_apiPost = apiMocks.apiPost
  g.__vuestrata_apiPatch = apiMocks.apiPatch
})

describe('useInviteUserMutation', () => {
  it('posts invite payloads and invalidates users queries', async () => {
    apiMocks.apiPost.mockResolvedValue(user)
    const { result, invalidateQueries } = mountComposable(() => useInviteUserMutation())
    const payload: InviteUserPayload = {
      email: 'u1@example.test',
      name: 'User One',
      role: 'member',
    }

    await expect(result.inviteUser(payload)).resolves.toEqual(user)

    expect(apiMocks.apiPost).toHaveBeenCalledWith('/users', payload)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('exposes rejected invite requests through mutateAsync', async () => {
    apiMocks.apiPost.mockRejectedValue(new Error('Email already exists'))
    const { result } = mountComposable(() => useInviteUserMutation())

    await expect(
      result.inviteUser({ email: 'u1@example.test', name: 'User One', role: 'member' }),
    ).rejects.toThrow(/Email already exists/i)
  })
})

describe('useUpdatePermissionsMutation', () => {
  it('patches explicit permissions and invalidates users queries', async () => {
    apiMocks.apiPatch.mockResolvedValue({ ...user, permissions: ['users:read'] })
    const { result, invalidateQueries } = mountComposable(() => useUpdatePermissionsMutation())
    const payload: UpdatePermissionsPayload = {
      id: 'u1',
      permissions: ['users:read'],
    }

    await expect(result.updatePermissions(payload)).resolves.toMatchObject({
      id: 'u1',
      permissions: ['users:read'],
    })

    expect(apiMocks.apiPatch).toHaveBeenCalledWith('/users/u1/permissions', {
      permissions: ['users:read'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('exposes rejected permission updates through mutateAsync', async () => {
    apiMocks.apiPatch.mockRejectedValue(new Error('Forbidden'))
    const { result } = mountComposable(() => useUpdatePermissionsMutation())

    await expect(
      result.updatePermissions({ id: 'u1', permissions: ['users:read'] }),
    ).rejects.toThrow(/Forbidden/i)
  })
})
