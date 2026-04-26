import { defineQueryKeys } from '~/lib/query-keys'

/**
 * Analytics module query keys.
 * Dashboard stats and audit logs are the main server-state resources.
 */
export const analyticsModuleKeys = {
  ...defineQueryKeys('analytics'),
  stats: () => ['analytics', 'stats'] as const,
  auditLogs: (params?: Record<string, unknown>) => ['analytics', 'audit-logs', params] as const,
}
