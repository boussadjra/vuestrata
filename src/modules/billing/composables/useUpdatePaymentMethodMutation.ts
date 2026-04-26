import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { apiFetch } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type { PaymentMethod } from '~/types'

import { billingModuleKeys } from '../query-keys'

const billingLogger = createScopedLogger('billing')

/**
 * Mutation composable — updates the default payment method.
 */
export function useUpdatePaymentMethodMutation() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      apiFetch<PaymentMethod[]>('/billing/payment-methods', {
        method: 'PUT',
        body: { defaultPaymentMethodId: paymentMethodId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingModuleKeys.all })
    },
    onError: (error, paymentMethodId) => {
      billingLogger.error('Failed to update default payment method', {
        paymentMethodId,
        error,
      })
    },
  })

  return {
    updatePaymentMethod: (paymentMethodId: string) => mutation.mutateAsync(paymentMethodId),
    isPending: mutation.isPending,
    error: mutation.error,
  }
}
