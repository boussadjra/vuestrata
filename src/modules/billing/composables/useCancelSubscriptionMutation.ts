import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { apiFetch } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type { Subscription } from '~/types'

import { billingModuleKeys } from '../query-keys'

const billingLogger = createScopedLogger('billing')

/**
 * Mutation composable — cancels the current subscription.
 */
export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiFetch<Subscription>('/billing/cancel', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingModuleKeys.all })
      billingLogger.info('Subscription canceled')
    },
    onError: (error) => {
      billingLogger.error('Subscription cancellation failed', { error })
    },
  })

  return {
    cancel: () => mutation.mutateAsync(),
    isPending: mutation.isPending,
    error: mutation.error,
  }
}
