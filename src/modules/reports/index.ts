import type { ModuleDefinition } from '../types'
import reportsI18nAr from './i18n/ar.json'
import reportsI18nEn from './i18n/en.json'
import reportsI18nFr from './i18n/fr.json'

/**
 * Reports Module
 *
 * The permission-restricted page pattern, in two layers: the route requires
 * `reports:read`, and the export control requires the higher `reports:export`.
 * A viewer sees the whole report and no export button.
 *
 * Both layers are UI affordances only. The server remains the authority — a
 * hidden button stops nobody who can type a URL.
 */
const reportsModule: ModuleDefinition = {
  config: {
    id: 'reports',
    name: 'Reports',
    description: 'Saved reports across revenue, pipeline, usage, and support',
    version: '1.0.0',
    category: 'organization',
    order: 20,
    enabledByDefault: true,
    permissions: ['reports:read', 'reports:export'],
  },

  routes: [
    {
      path: '/dashboard/reports',
      name: '/dashboard/reports',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'reports:read',
        module: 'reports',
        title: 'reports_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'reports_nav',
      icon: 'graph',
      to: '/dashboard/reports',
      permission: 'reports:read',
      group: 'organization',
      order: 15,
    },
  ],

  ...(__VUESTRATA_DEMO__
    ? { mockHandlers: async () => (await import('./mocks/reports.handlers')).reportsHandlers }
    : {}),

  i18n: {
    en: reportsI18nEn,
    fr: reportsI18nFr,
    ar: reportsI18nAr,
  },
}

export default reportsModule

// ─── Public API barrel ──────────────────────────────────
export { useReportsQuery, useReportQuery } from './composables/useReports'
export { reportsModuleKeys } from './query-keys'
export { REPORT_KINDS, REPORT_PERIODS, reportSchema } from './types'
export type { Report, ReportFilters, ReportKind, ReportPeriod, ReportRow } from './types'
