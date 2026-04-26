export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise'
export type BillingInterval = 'monthly' | 'yearly'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid'
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export interface Plan {
  id: string
  name: string
  tier: PlanTier
  description: string
  price: { monthly: number; yearly: number }
  features: string[]
  limits: {
    users: number
    storage: number // GB
    apiCalls: number
  }
  highlighted?: boolean
}

export interface Subscription {
  id: string
  planId: string
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
}

export interface Invoice {
  id: string
  number: string
  status: InvoiceStatus
  amount: number
  currency: string
  periodStart: string
  periodEnd: string
  paidAt?: string
  pdfUrl?: string
}

export interface PaymentMethod {
  id: string
  type: 'card' | 'bank_account'
  last4: string
  brand?: string
  expiryMonth?: number
  expiryYear?: number
  isDefault: boolean
}

export interface UsageMetrics {
  users: { current: number; limit: number }
  storage: { current: number; limit: number }
  apiCalls: { current: number; limit: number }
}
