import { param } from '@queryweave/core'

import { defineListQueryModel } from '~/lib/table-query'

import { CUSTOMER_PLANS, CUSTOMER_STATUSES } from './types'

export const customersListQueryModel = defineListQueryModel({
  sortBy: ['company', 'contactName', 'status', 'plan', 'mrr', 'lastContactAt'],
  fields: {
    status: param.choice(['all', ...CUSTOMER_STATUSES]).default('all'),
    plan: param.choice(['all', ...CUSTOMER_PLANS]).default('all'),
  },
})
