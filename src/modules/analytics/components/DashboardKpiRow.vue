<script setup lang="ts">
import { UiButton, UiEmptyState, UiStatCard } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'

import { useDashboardI18n } from '../composables/useDashboardI18n'
import { kpiComparedTo, kpiTitle } from '../lib/dashboard-labels'
import type { DashboardStats, Kpi } from '../types/dashboard'

const props = defineProps<{
  data: DashboardStats | undefined
  loading: boolean
  error: boolean
  /** Refetch in flight after the first result — do not blank the row. */
  updating?: boolean
}>()

defineEmits<{ retry: [] }>()

const { dt } = useDashboardI18n()
const { currency, number, percent } = useFormatters()

/** Placeholder count while loading, so the row does not collapse and reflow. */
const SKELETON_COUNT = 4

const kpis = computed(() => props.data?.kpis ?? [])

/**
 * Formats a KPI according to the `format` the API declares.
 *
 * The API sends a raw number plus a format hint; the client decides how to
 * render it for the active locale. Previously the API sent a pre-formatted
 * `"$45,231"`, which hardcoded English grouping and a leading `$` for every
 * locale — and could not be summed or compared.
 */
function formatValue(kpi: Kpi): string {
  if (kpi.format === 'currency') return currency(kpi.value, kpi.currency ?? 'USD', true)
  if (kpi.format === 'percent') return percent(kpi.value)
  return number(kpi.value)
}

/**
 * `comparedTo` is a range key (`7d`), not copy. Translating here keeps
 * `UiStatCard` / `UiTrendDelta` as display-string components.
 */
function comparisonLabel(kpi: Kpi): string {
  return kpiComparedTo(kpi.trend.comparedTo)
}

function displayTrend(kpi: Kpi) {
  return { ...kpi.trend, comparedTo: comparisonLabel(kpi) }
}
</script>

<template>
  <div
    class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    :aria-busy="loading || updating || undefined"
  >
    <template v-if="loading">
      <UiStatCard
        v-for="index in SKELETON_COUNT"
        :key="index"
        :label="dt('common_loading')"
        value=""
        loading
      />
    </template>

    <section
      v-else-if="error"
      data-ui="card"
      class="border-border bg-card rounded-[var(--shape-radius)] border shadow-(--shadow-card) sm:col-span-2 xl:col-span-4"
    >
      <UiEmptyState
        variant="error"
        size="sm"
        :title="dt('common_error_title')"
        :description="dt('common_error_body')"
      >
        <template #action>
          <UiButton variant="ghost" size="sm" :loading="updating" @click="$emit('retry')">
            {{ dt('common_retry') }}
          </UiButton>
        </template>
      </UiEmptyState>
    </section>

    <UiStatCard
      v-else
      v-for="kpi in kpis"
      :key="kpi.id"
      :label="kpiTitle(kpi.id)"
      :value="formatValue(kpi)"
      :hint="comparisonLabel(kpi)"
      :trend="displayTrend(kpi)"
    />
  </div>
</template>
