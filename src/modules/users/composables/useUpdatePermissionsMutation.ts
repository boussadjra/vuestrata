import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { apiPatch } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type { Permission, User } from '~/types'

import { usersModuleKeys } from '../query-keys'

const log = createScopedLogger('users')

export interface UpdatePermissionsPayload {
  id: string
  permissions: Permission[]
}

interface UpdatePermissionsMutationTestGlobals {
  __vuestrata_apiPatch?: typeof apiPatch
}

export function useUpdatePermissionsMutation() {
  const queryClient = useQueryClient()

  // Allow tests to inject a mock implementation via `globalThis.__vuestrata_apiPatch`
  const testGlobals = globalThis as typeof globalThis & UpdatePermissionsMutationTestGlobals
  const _apiPatch = testGlobals.__vuestrata_apiPatch ?? apiPatch

  const mutation = useMutation({
    mutationKey: ['users', 'permissions'],
    mutationFn: ({ id, permissions }: UpdatePermissionsPayload) =>
      _apiPatch<User>(`/users/${id}/permissions`, { permissions }),
    onSuccess: (_user, { id }) => {
      void queryClient.invalidateQueries({ queryKey: usersModuleKeys.all })
      log.info('User permissions updated', { userId: id })
    },
    onError: (error, { id }) => {
      log.error('Failed to update user permissions', { userId: id, error })
    },
  })

  return {
    updatePermissions: (payload: UpdatePermissionsPayload) => mutation.mutateAsync(payload),
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
