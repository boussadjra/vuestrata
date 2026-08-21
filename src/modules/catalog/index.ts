import type { ModuleDefinition } from '../types'
import catalogI18nAr from './i18n/ar.json'
import catalogI18nEn from './i18n/en.json'
import catalogI18nFr from './i18n/fr.json'

/**
 * Catalog Module
 *
 * Demonstrates the card-grid list (where a description matters more than a
 * column of comparable figures) and inline editing on the record page. The
 * form is rendered disabled rather than hidden for read-only roles, so a viewer
 * can still see what a manager can change.
 */
const catalogModule: ModuleDefinition = {
  config: {
    id: 'catalog',
    origin: 'demo',
    name: 'Products',
    description: 'Product catalogue, pricing, and stock levels',
    version: '1.0.0',
    category: 'commerce',
    order: 30,
    enabledByDefault: true,
    permissions: ['catalog:read', 'catalog:manage'],
  },

  routes: [
    {
      path: '/dashboard/products',
      name: '/dashboard/products',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'catalog:read',
        module: 'catalog',
        title: 'catalog_nav',
      },
    },
    // Before `:id`, or the dynamic segment matches "new" first.
    {
      path: '/dashboard/products/new',
      name: '/dashboard/products/new',
      component: () => import('./pages/detail.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'catalog:manage',
        module: 'catalog',
        title: 'catalog_new_title',
      },
    },
    {
      path: '/dashboard/products/:id',
      name: '/dashboard/products/:id',
      component: () => import('./pages/detail.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'catalog:read',
        module: 'catalog',
        title: 'catalog_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'catalog_nav',
      icon: 'layers',
      to: '/dashboard/products',
      permission: 'catalog:read',
      group: 'commerce',
      order: 30,
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/catalog.handlers')).catalogHandlers }
    : {}),

  i18n: {
    en: catalogI18nEn,
    fr: catalogI18nFr,
    ar: catalogI18nAr,
  },
}

export default catalogModule

// ─── Public API barrel ──────────────────────────────────
export {
  useProductsQuery,
  useProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
} from './composables/useCatalog'
export { catalogModuleKeys } from './query-keys'
export {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  productSchema,
  productDraftSchema,
  stockLevelOf,
} from './types'
export type {
  Product,
  ProductDraft,
  ProductFilters,
  ProductCategory,
  ProductStatus,
  StockLevel,
} from './types'
