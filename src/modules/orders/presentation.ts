/**
 * Order presentation rules.
 *
 * Shared by the list and the record page so a "refunded" order cannot be red
 * in one place and grey in the other. The colour is always accompanied by the
 * translated status text (WCAG 1.4.1).
 */
import type { Order, OrderStatus } from './types'

export type OrderStatusVariant = 'success' | 'warning' | 'error' | 'default' | 'primary'

const STATUS_VARIANT: Record<OrderStatus, OrderStatusVariant> = {
  draft: 'default',
  pending: 'warning',
  paid: 'primary',
  fulfilled: 'success',
  cancelled: 'error',
  refunded: 'error',
}

export function orderStatusVariant(status: OrderStatus): OrderStatusVariant {
  return STATUS_VARIANT[status]
}

/** Total units on an order — the count a reader means by "how big is it". */
export function orderItemCount(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0)
}
