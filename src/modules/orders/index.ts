import type { ModuleDefinition } from '../types'
import ordersI18nAr from './i18n/ar.json'
import ordersI18nEn from './i18n/en.json'
import ordersI18nFr from './i18n/fr.json'

/**
 * Orders Module
 *
 * Demonstrates the multi-step form pattern alongside the standard list/detail
 * pair, and the rule that money is always derived server-side: the create
 * endpoint prices the submitted lines with `priceOrder` and ignores any total
 * the client sends.
 *
 * The nav entry is a group with children, which is what exercises the nested
 * sidebar disclosure and its collapsed-rail flyout.
 */
const ordersModule: ModuleDefinition = {
  config: {
    id: 'orders',
    name: 'Orders',
    description: 'Order capture, fulfilment, and revenue',
    version: '1.0.0',
    category: 'commerce',
    order: 20,
    enabledByDefault: true,
    permissions: ['orders:read', 'orders:manage'],
  },

  routes: [
    {
      path: '/dashboard/orders',
      name: '/dashboard/orders',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'orders:read',
        module: 'orders',
        title: 'orders_nav',
      },
    },
    // Declared before `:id` so the dynamic segment does not swallow it.
    {
      path: '/dashboard/orders/new',
      name: '/dashboard/orders/new',
      component: () => import('./pages/new.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'orders:manage',
        module: 'orders',
        title: 'orders_new_title',
      },
    },
    {
      path: '/dashboard/orders/:id',
      name: '/dashboard/orders/:id',
      component: () => import('./pages/detail.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'orders:read',
        module: 'orders',
        title: 'orders_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'orders_nav',
      icon: 'shopping-cart',
      to: '/dashboard/orders',
      permission: 'orders:read',
      group: 'commerce',
      order: 20,
      // The parent links to the list AND holds children, so clicking the label
      // still goes somewhere useful. A disclosure that only expands makes the
      // most-wanted destination the one that takes two clicks.
      exact: true,
      children: [
        {
          label: 'orders_nav_all',
          icon: 'list',
          to: '/dashboard/orders',
          permission: 'orders:read',
          exact: true,
        },
        {
          label: 'orders_nav_new',
          icon: 'document-add',
          to: '/dashboard/orders/new',
          permission: 'orders:manage',
        },
      ],
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/orders.handlers')).ordersHandlers }
    : {}),

  i18n: {
    en: ordersI18nEn,
    fr: ordersI18nFr,
    ar: ordersI18nAr,
  },
}

export default ordersModule

// ─── Public API barrel ──────────────────────────────────
export {
  useOrdersQuery,
  useOrderQuery,
  useCreateOrderMutation,
  useUpdateOrderMutation,
} from './composables/useOrders'
export { ordersModuleKeys } from './query-keys'
export { priceOrder, subtotalOf, ORDER_CATALOG } from './pricing'
export { ORDER_CHANNELS, ORDER_STATUSES, orderSchema, orderDraftSchema } from './types'
export type { Order, OrderDraft, OrderFilters, OrderLine, OrderStatus, OrderChannel } from './types'
