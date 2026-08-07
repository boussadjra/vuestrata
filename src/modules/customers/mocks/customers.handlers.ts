import { money } from '~/lib/money'
/**
 * Customers mock backend — demo builds only.
 *
 * Loaded through the module's `mockHandlers` factory, which is a dynamic
 * `import()`. A static import here would pull `msw` into the module barrel's
 * graph and therefore into real production bundles.
 */
import { createCollectionMock } from '~/mocks/collection'

import { customerDraftSchema, type Customer } from '../types'
import { customerFixtures } from './fixtures'

const customersMock = createCollectionMock<Customer>({
  resource: 'customers',
  seed: customerFixtures,
  searchFields: ['company', 'contactName', 'email', 'city'],
  filterFields: ['status', 'plan', 'country'],
  defaultSort: { by: 'company', order: 'asc' },

  create: (body, existing) => {
    // Validated with the same schema the form uses, so the mock rejects exactly
    // what a correct backend would rather than accepting anything and letting
    // the bug surface later as a malformed row.
    const parsed = customerDraftSchema.safeParse(body)
    if (!parsed.success) return null

    const now = new Date().toISOString()
    return {
      ...parsed.data,
      id: `CUS-${1000 + existing.length}`,
      owner: parsed.data.contactName,
      mrr: money(0),
      lifetimeValue: money(0),
      openOrders: 0,
      since: now,
      lastContactAt: now,
    }
  },

  update: (record, body) => {
    const parsed = customerDraftSchema.partial().safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data }
  },
})

export const customersHandlers = customersMock.handlers
export const resetCustomersMock = customersMock.reset
