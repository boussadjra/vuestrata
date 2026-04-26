import type { Plan } from '~/types'

/**
 * Static plan definitions — source of truth for available subscription plans.
 * Canonical billing types live in src/types/billing.ts.
 */
export const PLANS: Plan[] = [
  {
    id: 'plan_free',
    name: 'Free',
    tier: 'free',
    description: 'For individuals and small side projects',
    price: { monthly: 0, yearly: 0 },
    features: [
      'Up to 3 team members',
      '1 GB storage',
      '1,000 API calls/month',
      'Community support',
      'Basic analytics',
    ],
    limits: { users: 3, storage: 1, apiCalls: 1_000 },
  },
  {
    id: 'plan_starter',
    name: 'Starter',
    tier: 'starter',
    description: 'For growing teams that need more power',
    price: { monthly: 29, yearly: 290 },
    features: [
      'Up to 10 team members',
      '10 GB storage',
      '50,000 API calls/month',
      'Email support',
      'Advanced analytics',
      'Custom branding',
    ],
    limits: { users: 10, storage: 10, apiCalls: 50_000 },
  },
  {
    id: 'plan_pro',
    name: 'Pro',
    tier: 'pro',
    description: 'For professional teams and businesses',
    price: { monthly: 79, yearly: 790 },
    features: [
      'Up to 50 team members',
      '100 GB storage',
      '500,000 API calls/month',
      'Priority support',
      'Advanced analytics & exports',
      'Custom branding',
      'SSO / SAML',
      'Audit logs',
    ],
    limits: { users: 50, storage: 100, apiCalls: 500_000 },
    highlighted: true,
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    description: 'For large organizations with advanced needs',
    price: { monthly: 299, yearly: 2990 },
    features: [
      'Unlimited team members',
      '1 TB storage',
      'Unlimited API calls',
      'Dedicated support',
      'Advanced analytics & exports',
      'Custom branding',
      'SSO / SAML',
      'Audit logs',
      'SLA guarantee',
      'Custom integrations',
    ],
    limits: { users: -1, storage: 1000, apiCalls: -1 },
  },
]
