import type { ModuleDefinition } from '../types'
import customersI18nAr from './i18n/ar.json'
import customersI18nEn from './i18n/en.json'
import customersI18nFr from './i18n/fr.json'

/**
 * Customers Module
 *
 * The reference implementation of a CRUD domain: a list backed by
 * `createCollectionApi` (server-side search, sort, filter and pagination), a
 * record page, and one form serving both create and edit.
 *
 * Public API (importable via barrel `~/modules/customers`):
 *   - useCustomersQuery / useCustomerQuery and the three mutations
 *   - customersModuleKeys, Customer, CustomerFilters, CustomerDraft
 */
const customersModule: ModuleDefinition = {
  config: {
    id: 'customers',
    name: 'Customers',
    description: 'Customer accounts, contacts, and revenue',
    version: '1.0.0',
    category: 'commerce',
    order: 10,
    enabledByDefault: true,
    permissions: ['customers:read', 'customers:manage'],
  },

  routes: [
    {
      path: '/dashboard/customers',
      name: '/dashboard/customers',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'customers:read',
        module: 'customers',
        title: 'customers_nav',
      },
    },
    // `new` is declared BEFORE `:id`. vue-router matches in registration order
    // for equally-ranked paths, and the dynamic segment would otherwise swallow
    // it — the create page would try to load a customer with the id "new".
    {
      path: '/dashboard/customers/new',
      name: '/dashboard/customers/new',
      component: () => import('./pages/form.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'customers:manage',
        module: 'customers',
        title: 'customers_new_title',
      },
    },
    {
      path: '/dashboard/customers/:id/edit',
      name: '/dashboard/customers/:id/edit',
      component: () => import('./pages/form.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'customers:manage',
        module: 'customers',
        title: 'customers_edit_title',
      },
    },
    {
      path: '/dashboard/customers/:id',
      name: '/dashboard/customers/:id',
      component: () => import('./pages/detail.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'customers:read',
        module: 'customers',
        title: 'customers_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'customers_nav',
      icon: 'users',
      to: '/dashboard/customers',
      permission: 'customers:read',
      group: 'commerce',
      order: 10,
    },
  ],

  // The property itself is conditional, not just its body. Declaring
  // `mockHandlers` unconditionally keeps the arrow function — and therefore the
  // dynamic `import()` — in the barrel's graph, and rolldown emits the msw
  // chunk for a production build that can never call it.
  ...(__VUESTRATA_DEMO__
    ? {
        mockHandlers: async () => (await import('./mocks/customers.handlers')).customersHandlers,
      }
    : {}),

  i18n: {
    en: customersI18nEn,
    fr: customersI18nFr,
    ar: customersI18nAr,
  },
}

export default customersModule

// ─── Public API barrel ──────────────────────────────────
export {
  useCustomersQuery,
  useCustomerQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
} from './composables/useCustomers'
export { customersModuleKeys } from './query-keys'
export { CUSTOMER_PLANS, CUSTOMER_STATUSES, customerSchema, customerDraftSchema } from './types'
export type {
  Customer,
  CustomerDraft,
  CustomerFilters,
  CustomerPlan,
  CustomerStatus,
} from './types'
