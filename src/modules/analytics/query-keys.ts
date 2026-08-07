import { defineQueryKeys } from '~/lib/query-keys'

/**
 * Analytics module query keys.
 * Dashboard stats and audit logs are the main server-state resources.
 */
export const analyticsModuleKeys = {
  ...defineQueryKeys('analytics'),
  /**
   * Dashboard resources are keyed by resource name AND the active filters, so
   * changing the range or segment refetches instead of showing the previous
   * window's numbers under the new label.
   */
  dashboard: (resource: string, params?: Record<string, unknown>) =>
    ['analytics', 'dashboard', resource, params] as const,
  auditLogs: (params?: Record<string, unknown>) => ['analytics', 'audit-logs', params] as const,
}
