import { useQueryClient } from '@tanstack/vue-query'

import { createApiAction } from '~/lib/api/collection-queries'
import { appEvents } from '~/lib/events'
import { createScopedLogger } from '~/lib/logger'
import type { PaginatedResponse, User, Role } from '~/types'

import { usersModuleKeys } from '../query-keys'
import { userRecordSchema, userRoleUpdateSchema } from '../types'

const log = createScopedLogger('users')

/**
 * `PATCH /users/{id}/role`, as a validated action: the body is checked before
 * it is sent, the user that comes back is checked before anything reads it,
 * and every users query is invalidated once the call settles. It used to be a
 * bare `apiPatch<User>()`, whose `<User>` was a promise nobody kept.
 *
 * Every users query, not `list()` with no params: that key is
 * ['users','list',undefined], which does NOT match ['users','list',{...}]
 * under TanStack Query's prefix filter, so the paginated caches would never
 * refresh.
 */
const useRoleAction = createApiAction({
  resource: 'users',
  method: 'PATCH',
  path: (userId) => `/users/${userId}/role`,
  input: userRoleUpdateSchema,
  output: userRecordSchema,
  invalidates: [usersModuleKeys.all],
})

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
  const mutation = useRoleAction()

  async function updateRole(userId: string, role: Role): Promise<User> {
    // Read before the call: the lists are refetched once it settles.
    const oldRole = findCachedUserRole(queryClient, userId)
    try {
      const user = await mutation.mutateAsync({ id: userId, input: { role } })
      appEvents.emit('user.role_changed', { userId, oldRole, newRole: role })
      log.info('User role updated', { userId, role })
      return user
    } catch (error) {
      log.error('Failed to update user role', { userId, role, error })
      throw error
    }
  }

  return {
    updateRole,
    isPending: mutation.isPending,
    error: mutation.error,
  }
}
