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

export function useUpdatePermissionsMutation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationKey: ['users', 'permissions'],
    mutationFn: ({ id, permissions }: UpdatePermissionsPayload) =>
      apiPatch<User>(`/users/${id}/permissions`, { permissions }),
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
