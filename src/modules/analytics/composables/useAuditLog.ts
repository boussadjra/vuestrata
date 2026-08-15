/**
 * The audit log's reactive workflow.
 *
 * Two filters that behave differently on purpose: the action filter is a query
 * parameter (the server pages by it), while the search box refines the page
 * already on screen. Keeping both here means the page cannot get the
 * distinction wrong, and the stat tiles are derived once instead of being
 * recomputed inline in four template expressions.
 */
import { countAuditActionsByPrefix, filterAuditEntries, uniqueAuditActions } from '../lib/audit-log'
import { useAuditLogsQuery, type AuditLogFilters } from './useAuditLogsQuery'

const PAGE_SIZE = 10

export function useAuditLog() {
  const page = ref(1)
  const action = ref('')
  const search = ref('')

  const filters = computed<AuditLogFilters>(() => ({
    page: page.value,
    limit: PAGE_SIZE,
    action: action.value || undefined,
  }))

  const { entries, totalPages, total, isLoading, refetch } = useAuditLogsQuery(filters)

  const visibleEntries = computed(() => filterAuditEntries(entries.value, search.value))
  const actions = computed(() => uniqueAuditActions(entries.value))

  const stats = computed(() => ({
    total: total.value,
    auth: countAuditActionsByPrefix(entries.value, 'user.'),
    billing: countAuditActionsByPrefix(entries.value, 'billing.'),
    uniqueActions: actions.value.length,
  }))

  function goToPage(next: number) {
    page.value = Math.min(Math.max(next, 1), Math.max(totalPages.value, 1))
  }

  function filterByAction(next: string) {
    action.value = next
    // A filter change invalidates the current offset — page 4 of "all" is
    // rarely page 4 of "billing.cancel", and is usually empty.
    page.value = 1
  }

  return {
    page,
    action,
    search,
    entries,
    visibleEntries,
    actions,
    stats,
    totalPages,
    isLoading,
    refetch,
    goToPage,
    filterByAction,
  }
}
