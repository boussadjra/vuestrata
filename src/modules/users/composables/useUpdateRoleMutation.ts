import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { apiPatch } from '~/lib/api/client'
import { appEvents } from '~/lib/events'
import { createScopedLogger } from '~/lib/logger'
import type { PaginatedResponse, User, Role } from '~/types'

import { usersModuleKeys } from '../query-keys'

const log = createScopedLogger('users')

/**
 * Look up a user's current role in any cached users list so we can emit the
 * correct `oldRole` when the mutation succeeds. Returns an empty string when
 * the user is not in cache (event consumers already treat `''` as unknown).
 */
function findCachedUserRole(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
): string {
  const lists = queryClient.getQueriesData<PaginatedResponse<User>>({
    queryKey: usersModuleKeys.all,
  })
  for (const [, data] of lists) {
    const match = data?.data?.find((u) => u.id === userId)
    if (match) return match.role
  }
  return ''
}

/**
 * Mutation composable — updates a user's role.
 */
export function useUpdateRoleMutation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      apiPatch<User>(`/users/${userId}/role`, { role }),
    onMutate: ({ userId }) => ({ oldRole: findCachedUserRole(queryClient, userId) }),
    onSuccess: (_updatedUser, { userId, role }, context) => {
      // Invalidate every users query (lists with different filters, details,
      // derived actions). Using `list()` with no params produces the key
      // ['users','list',undefined], which does NOT match ['users','list',{...}]
      // under TanStack Query's prefix filter — the paginated caches would
      // never refresh.
      void queryClient.invalidateQueries({ queryKey: usersModuleKeys.all })
      appEvents.emit('user.role_changed', {
        userId,
        oldRole: context?.oldRole ?? '',
        newRole: role,
      })
      log.info('User role updated', { userId, role })
    },
    onError: (error, { userId, role }) => {
      log.error('Failed to update user role', { userId, role, error })
    },
  })

  return {
    updateRole: (userId: string, role: Role) => mutation.mutateAsync({ userId, role }),
    isPending: mutation.isPending,
    error: mutation.error,
  }
}
