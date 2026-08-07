/**
 * Seeded customer accounts.
 *
 * Deterministic: same list on every reload, in every browser, so a screenshot
 * or an e2e assertion stays valid. Figures are internally consistent — MRR
 * follows the plan, lifetime value follows MRR and tenure — because a demo
 * where a "starter" account bills more than an "enterprise" one teaches the
 * reader that the numbers are noise and stops them reading the UI at all.
 */

import { money } from '~/lib/money'
import {
  COMPANY_NAMES,
  CITIES,
  PEOPLE_NAMES,
  createRng,
  daysFromNow,
  pick,
  randomInt,
  sequentialId,
  slugify,
  slugifyName,
} from '~/mocks/seed'

import { CUSTOMER_PLANS, CUSTOMER_STATUSES, type Customer, type CustomerPlan } from '../types'

/** Monthly recurring revenue band per plan, in cents. */
const PLAN_MRR: Record<CustomerPlan, [number, number]> = {
  starter: [4_900, 9_900],
  growth: [24_900, 49_900],
  scale: [99_000, 199_000],
  enterprise: [340_000, 890_000],
}

/**
 * Plan mix, weighted rather than uniform.
 *
 * A real book of business is mostly small accounts with a long tail of large
 * ones. Sampling the four plans evenly would put 25% of customers on
 * enterprise, which makes every revenue chart look wrong to anyone who has seen
 * a real one.
 */
const PLAN_WEIGHTS: CustomerPlan[] = [
  'starter',
  'starter',
  'starter',
  'starter',
  'growth',
  'growth',
  'growth',
  'scale',
  'scale',
  'enterprise',
]

export function createCustomerFixtures(count = 48): Customer[] {
  const rng = createRng(20_260_729)

  return Array.from({ length: count }, (_, index) => {
    const company = `${COMPANY_NAMES[index % COMPANY_NAMES.length]}${
      index >= COMPANY_NAMES.length ? ` ${Math.floor(index / COMPANY_NAMES.length) + 1}` : ''
    }`
    const contactName = PEOPLE_NAMES[index % PEOPLE_NAMES.length]!
    const location = pick(rng, CITIES)
    const plan = pick(rng, PLAN_WEIGHTS)
    const status = pick(rng, CUSTOMER_STATUSES)

    const mrrAmount = randomInt(rng, PLAN_MRR[plan][0], PLAN_MRR[plan][1])
    const tenureDays = randomInt(rng, 40, 1_400)
    // Lifetime value tracks MRR × tenure with a little variance, so the two
    // columns agree when a reader compares them.
    const lifetime = Math.round((mrrAmount * tenureDays * randomInt(rng, 85, 115)) / (30 * 100))

    return {
      id: sequentialId('CUS', index),
      company,
      contactName,
      email: `${slugifyName(contactName)}@${slugify(company)}.example`,
      phone: `+1 555 ${String(randomInt(rng, 1000, 9999))}`,
      status,
      plan,
      city: location.city,
      country: location.country,
      owner: PEOPLE_NAMES[(index * 7) % PEOPLE_NAMES.length]!,
      // A churned account bills nothing. Leaving MRR on it is the kind of
      // detail that makes a demo dataset quietly incoherent.
      mrr: money(status === 'churned' ? 0 : mrrAmount),
      lifetimeValue: money(lifetime),
      openOrders: status === 'active' ? randomInt(rng, 0, 6) : 0,
      since: daysFromNow(-tenureDays),
      lastContactAt: daysFromNow(-randomInt(rng, 0, 60), randomInt(rng, 8, 18)),
      notes: '',
    } satisfies Customer
  })
}

export const customerFixtures = createCustomerFixtures()

export const CUSTOMER_PLAN_OPTIONS = CUSTOMER_PLANS
export const CUSTOMER_STATUS_OPTIONS = CUSTOMER_STATUSES
