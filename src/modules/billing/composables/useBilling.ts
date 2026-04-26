/**
 * Backward-compatible aggregate composable.
 * New code should prefer the individual operation composables:
 *   - useBillingQuery
 *   - useSubscribeMutation
 *   - useCancelSubscriptionMutation
 *   - useUpdatePaymentMethodMutation
 */

import type { BillingInterval } from '~/types'

import { useBillingQuery } from './useBillingQuery'
import { useCancelSubscriptionMutation } from './useCancelSubscriptionMutation'
import { useSubscribeMutation } from './useSubscribeMutation'
import { useUpdatePaymentMethodMutation } from './useUpdatePaymentMethodMutation'

export { PLANS } from './constants'

export function useBilling() {
  const query = useBillingQuery()
  const { subscribe, isPending: isSubscribing } = useSubscribeMutation()
  const { cancel, isPending: isCanceling } = useCancelSubscriptionMutation()
  const { updatePaymentMethod, isPending: isUpdatingPaymentMethod } =
    useUpdatePaymentMethodMutation()

  return reactive({
    currentPlan: query.currentPlan,
    subscription: query.subscription,
    invoices: query.invoices,
    paymentMethods: query.paymentMethods,
    usage: query.usage,
    isSubscribed: query.isSubscribed,
    currentTier: query.currentTier,
    isLoading: query.isLoading,
    error: query.error,
    fetchBillingData: query.refetch,
    subscribe: (planId: string, interval: BillingInterval) => subscribe(planId, interval),
    cancelSubscription: () => cancel(),
    updatePaymentMethod: (paymentMethodId: string) => updatePaymentMethod(paymentMethodId),
    // Expose mutation pending flags so pages can bind directly to them without
    // maintaining parallel local `ref`s that drift from the real state.
    isSubscribing,
    isCanceling,
    isUpdatingPaymentMethod,
  })
}
