import { param } from '@queryweave/core'

import { defineListQueryModel } from '~/lib/table-query'

import { ORDER_CHANNELS, ORDER_STATUSES } from './types'

export const ordersListQueryModel = defineListQueryModel({
  sortBy: ['reference', 'status', 'channel', 'total', 'placedAt'],
  fields: {
    status: param.choice(['all', ...ORDER_STATUSES]).default('all'),
    channel: param.choice(['all', ...ORDER_CHANNELS]).default('all'),
  },
})
