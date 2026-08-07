import type { ModuleDefinition } from '../types'
import settingsI18nAr from './i18n/ar.json'
import settingsI18nEn from './i18n/en.json'
import settingsI18nFr from './i18n/fr.json'

/**
 * Settings Module
 *
 * Demonstrates the client-state (Pinia) pattern:
 *   - All state is local display preferences — no API calls
 *   - Persisted to localStorage via useAppStorage
 *   - Changes trigger typed events so other modules can react
 *
 * Contrast with billing (TanStack Query) and users (TanStack Query):
 *   - Billing/Users data comes from the API → TanStack Query
 *   - Display settings live only in the browser → Pinia
 *
 * Public API (importable via barrel `~/modules/settings`):
 *   - useSettingsStore — Pinia store composable
 *   - SettingsState   — type
 */
const settingsModule: ModuleDefinition = {
  config: {
    id: 'settings',
    name: 'Settings',
    description: 'Display preferences and feature flag management',
    version: '1.0.0',
    category: 'system',
    order: 100,
    enabledByDefault: true,
    required: true,
    permissions: [],
  },

  routes: [
    {
      path: '/dashboard/settings',
      name: '/dashboard/settings',
      component: () => import('./pages/settings.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        module: 'settings',
        title: 'settings_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'settings_nav',
      icon: 'settings',
      to: '/dashboard/settings',
      group: 'account',
      order: 90,
    },
  ],

  i18n: {
    en: settingsI18nEn,
    fr: settingsI18nFr,
    ar: settingsI18nAr,
  },
}

export default settingsModule

// ─── Public API barrel ──────────────────────────────────
export { useSettingsStore } from './stores/settings'
export type { SettingsState } from './types'
