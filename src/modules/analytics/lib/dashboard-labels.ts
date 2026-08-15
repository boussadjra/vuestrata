import { dashboardT } from '../composables/useDashboardI18n'
import type { DashboardRange, Kpi } from '../types/dashboard'

export { ensureDashboardMessages } from '../composables/useDashboardI18n'

export function kpiTitle(id: Kpi['id']): string {
  if (id === 'activeUsers') return dashboardT('dash_kpi_activeUsers')
  if (id === 'newSignups') return dashboardT('dash_kpi_newSignups')
  if (id === 'churnRate') return dashboardT('dash_kpi_churnRate')
  return dashboardT('dash_kpi_revenue')
}

export function kpiComparedTo(range: DashboardRange): string {
  if (range === '30d') return dashboardT('dash_compared_30d')
  if (range === '90d') return dashboardT('dash_compared_90d')
  return dashboardT('dash_compared_7d')
}

export function revenueSourceLabel(key: string, fallback: string): string {
  if (key === 'subscriptions') return dashboardT('dash_source_subscriptions')
  if (key === 'enterprise') return dashboardT('dash_source_enterprise')
  if (key === 'one-time') return dashboardT('dash_source_one_time')
  if (key === 'add-ons') return dashboardT('dash_source_add_ons')
  return fallback
}
