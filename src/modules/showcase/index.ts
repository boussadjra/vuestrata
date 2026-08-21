import type { ModuleDefinition } from '../types'
import showcaseI18nAr from './i18n/ar.json'
import showcaseI18nEn from './i18n/en.json'
import showcaseI18nFr from './i18n/fr.json'

/**
 * Showcase Module
 *
 * Owns the forms and data-tables demo pages.
 * These are purely presentational — no server state or TanStack Query.
 *
 * Public API: none (all pages are internal)
 */
const showcaseModule: ModuleDefinition = {
  config: {
    id: 'showcase',
    origin: 'demo',
    name: 'Showcase',
    description: 'Forms and data-tables demonstration pages',
    version: '1.0.0',
    category: 'content',
    order: 50,
    enabledByDefault: true,
    permissions: [],
  },

  routes: [
    {
      path: '/dashboard/forms',
      name: '/dashboard/forms',
      component: () => import('./pages/forms.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        module: 'showcase',
        title: 'sidebar_forms',
      },
    },
    {
      path: '/dashboard/tables',
      name: '/dashboard/tables',
      component: () => import('./pages/tables.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        module: 'showcase',
        title: 'sidebar_tables',
      },
    },
  ],

  navItems: [
    {
      label: 'sidebar_forms',
      icon: 'document',
      to: '/dashboard/forms',
      group: 'reference',
      order: 40,
    },
    {
      label: 'sidebar_tables',
      icon: 'database',
      to: '/dashboard/tables',
      group: 'reference',
      order: 41,
    },
    {
      label: 'sidebar_components',
      icon: 'widget',
      to: '/docs/components/overview',
      group: 'reference',
      order: 42,
    },
  ],

  i18n: {
    en: showcaseI18nEn,
    fr: showcaseI18nFr,
    ar: showcaseI18nAr,
  },
}

export default showcaseModule
