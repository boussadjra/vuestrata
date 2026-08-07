/**
 * Backward-compatible aggregate composable.
 * New code should prefer the individual operation composables:
 *   - useUsersQuery
 *   - useUpdateRoleMutation
 */

import type { Role } from '~/types'

import type { UserFilters } from '../types'
import { useUpdateRoleMutation } from './useUpdateRoleMutation'
import { useUsersQuery } from './useUsersQuery'

export function useUsers(filters?: MaybeRef<UserFilters>) {
  const query = useUsersQuery(filters)
  const { updateRole, isPending: isUpdating } = useUpdateRoleMutation()

  return reactive({
    users: query.users,
    meta: query.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refresh: query.refetch,
    updateRole: (userId: string, role: Role) => updateRole(userId, role),
    isUpdating,
  })
}
