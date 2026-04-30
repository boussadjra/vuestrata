import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { apiPost } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type { Role, User } from '~/types'

import { usersModuleKeys } from '../query-keys'

const log = createScopedLogger('users')

export interface InviteUserPayload {
  email: string
  name: string
  role: Role
}

export function useInviteUserMutation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationKey: ['users', 'invite'],
    mutationFn: (payload: InviteUserPayload) => apiPost<User>('/users', payload),
    onSuccess: (_user) => {
      void queryClient.invalidateQueries({ queryKey: usersModuleKeys.all })
      log.info('User invited', { email: _user.email })
    },
    onError: (error, payload) => {
      log.error('Failed to invite user', { email: payload.email, error })
    },
  })

  return {
    inviteUser: (payload: InviteUserPayload) => mutation.mutateAsync(payload),
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
