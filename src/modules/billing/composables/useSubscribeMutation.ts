import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { apiFetch } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type { BillingInterval, Subscription } from '~/types'

import { billingModuleKeys } from '../query-keys'

const billingLogger = createScopedLogger('billing')

/**
 * Mutation composable — subscribes to a plan.
 */
export function useSubscribeMutation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: ({ planId, interval }: { planId: string; interval: BillingInterval }) =>
      apiFetch<Subscription>('/billing/subscribe', {
        method: 'POST',
        body: { planId, interval },
      }),
    onSuccess: (_sub, { planId }) => {
      void queryClient.invalidateQueries({ queryKey: billingModuleKeys.all })
      billingLogger.info('Subscribed to plan', { planId })
    },
    onError: (error, { planId }) => {
      billingLogger.error('Subscription failed', { planId, error })
    },
  })

  return {
    subscribe: (planId: string, interval: BillingInterval) =>
      mutation.mutateAsync({ planId, interval }),
    isPending: mutation.isPending,
    error: mutation.error,
  }
}
