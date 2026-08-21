import type { ModuleDefinition } from '../types'
import billingI18nAr from './i18n/ar.json'
import billingI18nEn from './i18n/en.json'
import billingI18nFr from './i18n/fr.json'

/**
 * Billing Module
 *
 * Demonstrates the server-state pattern:
 *   - All billing data is fetched from the API via TanStack Query (useBilling composable)
 *   - No Pinia store for billing data — the Query cache IS the state
 *   - Pinia is only used for UI preferences (e.g., selected billing interval) if needed
 *
 * Public API (importable via barrel `~/modules/billing`):
 *   - useBilling    — TanStack Query composable
 *   - PLANS         — static plan definitions
 *   - billingKeys   — typed query key factory
 *   - Plan, Subscription, BillingInterval, PlanTier — types
 */
const billingModule: ModuleDefinition = {
  config: {
    id: 'billing',
    origin: 'template',
    name: 'Billing',
    description: 'Subscription plans, invoices, and payment management',
    version: '1.0.0',
    category: 'billing',
    order: 10,
    enabledByDefault: true,
    permissions: ['billing:read', 'billing:manage'],
  },

  routes: [
    {
      path: '/dashboard/billing',
      name: '/dashboard/billing',
      component: () => import('./pages/billing.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'billing:read',
        module: 'billing',
        title: 'billing_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'billing_nav',
      icon: 'card',
      to: '/dashboard/billing',
      permission: 'billing:read',
      group: 'account',
      order: 30,
    },
  ],

  i18n: {
    en: billingI18nEn,
    fr: billingI18nFr,
    ar: billingI18nAr,
  },
}

export default billingModule

// ─── Public API barrel ──────────────────────────────────
// All cross-module consumers MUST import from here.
// Deep imports (e.g., ~/modules/billing/composables/useBilling) are forbidden.
export { PLANS } from './composables/constants'
export { useBilling } from './composables/useBilling'
export { useBillingQuery } from './composables/useBillingQuery'
export { useBillingActions } from './composables/useBillingActions'
export { useSubscribeMutation } from './composables/useSubscribeMutation'
export { useCancelSubscriptionMutation } from './composables/useCancelSubscriptionMutation'
export { useUpdatePaymentMethodMutation } from './composables/useUpdatePaymentMethodMutation'
export {
  isUnlimited,
  tierAccentClass,
  usageMetricViews,
  usagePercent,
  usageSeverity,
} from './presentation'
export { billingModuleKeys } from './query-keys'
export type { Plan, BillingInterval, Subscription, PlanTier } from './types'
