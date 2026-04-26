import { useQuery } from '@tanstack/vue-query'

import { apiFetch } from '~/lib/api/client'
import { normalizeError } from '~/lib/errors'
import type { Plan, Subscription, Invoice, PaymentMethod, UsageMetrics } from '~/types'

import { billingModuleKeys } from '../query-keys'
import { PLANS } from './constants'

const defaultUsage: UsageMetrics = {
  users: { current: 1, limit: 3 },
  storage: { current: 0.2, limit: 1 },
  apiCalls: { current: 245, limit: 1000 },
}

/**
 * Query composable — fetches the current billing state.
 * Returns derived reactive refs for plan, subscription, invoices, etc.
 */
export function useBillingQuery() {
  const query = useQuery({
    queryKey: billingModuleKeys.data(),
    queryFn: () =>
      apiFetch<{
        plan: Plan
        subscription: Subscription | null
        invoices: Invoice[]
        paymentMethods: PaymentMethod[]
        usage: UsageMetrics
      }>('/billing'),
  })

  const currentPlan = computed(() => query.data.value?.plan ?? PLANS[0]!)
  const subscription = computed(() => query.data.value?.subscription ?? null)
  const invoices = computed(() => query.data.value?.invoices ?? [])
  const paymentMethods = computed(() => query.data.value?.paymentMethods ?? [])
  const usage = computed(() => query.data.value?.usage ?? defaultUsage)
  const isSubscribed = computed(
    () => !!subscription.value && subscription.value.status === 'active',
  )
  const currentTier = computed(() => currentPlan.value.tier)
  const isLoading = computed(() => query.isLoading.value)
  const error = computed(() => {
    const e = query.error.value
    return e ? normalizeError(e).message : null
  })

  return {
    currentPlan,
    subscription,
    invoices,
    paymentMethods,
    usage,
    isSubscribed,
    currentTier,
    isLoading,
    error,
    refetch: () => query.refetch(),
  }
}
