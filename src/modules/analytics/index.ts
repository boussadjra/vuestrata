import type { ModuleDefinition } from '../types'
import analyticsI18nAr from './i18n/ar.json'
import analyticsI18nEn from './i18n/en.json'
import analyticsI18nFr from './i18n/fr.json'

/**
 * Analytics Module
 *
 * Owns the dashboard home, audit log, and charts pages.
 * Dashboard stats and audit logs use TanStack Query composables;
 * charts are purely visual with no server state.
 *
 * Public API (importable via barrel `~/modules/analytics`):
 *   - analyticsModuleKeys — typed query key factory
 */
const analyticsModule: ModuleDefinition = {
  config: {
    id: 'analytics',
    name: 'Analytics',
    description: 'Dashboard overview, audit log, and chart visualizations',
    version: '1.0.0',
    category: 'analytics',
    order: 1,
    enabledByDefault: true,
    permissions: ['audit:read'],
  },

  routes: [
    {
      path: '/dashboard',
      name: '/dashboard',
      component: () => import('./pages/index.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        module: 'analytics',
        title: 'sidebar_dashboard',
      },
    },
    {
      path: '/dashboard/audit',
      name: '/dashboard/audit',
      component: () => import('./pages/audit.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        requiredPermission: 'audit:read',
        module: 'analytics',
        title: 'sidebar_audit',
      },
    },
    {
      path: '/dashboard/charts',
      name: '/dashboard/charts',
      component: () => import('./pages/charts.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        module: 'analytics',
        title: 'sidebar_charts',
      },
    },
  ],

  navItems: [
    {
      label: 'sidebar_dashboard',
      icon: 'chart',
      to: '/dashboard',
      group: 'overview',
      // Exact: '/dashboard' prefixes every page in the app, so without this the
      // overview entry stays highlighted no matter where the user navigates.
      exact: true,
      order: 1,
    },
    {
      label: 'sidebar_charts',
      icon: 'graph',
      to: '/dashboard/charts',
      group: 'overview',
      order: 50,
    },
    {
      label: 'sidebar_audit',
      icon: 'shield-check',
      to: '/dashboard/audit',
      permission: 'audit:read',
      group: 'organization',
      order: 60,
    },
  ],

  i18n: {
    en: analyticsI18nEn,
    fr: analyticsI18nFr,
    ar: analyticsI18nAr,
  },
}

export default analyticsModule

// ─── Public API barrel ──────────────────────────────────
export {
  useActivitySeriesQuery,
  useAttentionItemsQuery,
  useDashboardStatsQuery,
  useFunnelQuery,
  useRecentActivityQuery,
  useRevenueBreakdownQuery,
  useSystemHealthQuery,
  useTeamPerformanceQuery,
  useUpcomingEventsQuery,
} from './composables/useDashboardQueries'
export { useAuditLogsQuery } from './composables/useAuditLogsQuery'
export type { AuditLogFilters } from './composables/useAuditLogsQuery'
export type {
  ActivitySeries,
  DashboardFilters,
  DashboardRange,
  DashboardSegment,
  DashboardStats,
  Funnel,
  Money,
  RevenueBreakdown,
  TeamPerformance,
  Trend,
} from './types/dashboard'
export { analyticsModuleKeys } from './query-keys'
