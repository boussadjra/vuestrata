<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiEmptyState, UiStatCard } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'

import type { DashboardStats, Kpi } from '../types/dashboard'

const props = defineProps<{
  data: DashboardStats | undefined
  loading: boolean
  error: boolean
}>()

const { t } = useI18n()
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
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <template v-if="loading">
      <UiStatCard
        v-for="index in SKELETON_COUNT"
        :key="index"
        :label="t('common_loading')"
        value=""
        loading
      />
    </template>

    <UiEmptyState
      v-else-if="error"
      variant="error"
      size="sm"
      class="sm:col-span-2 xl:col-span-4"
      :title="t('common_error_title')"
      :description="t('common_error_body')"
    />

    <UiStatCard
      v-else
      v-for="kpi in kpis"
      :key="kpi.id"
      :label="t(`dash_kpi_${kpi.id}`)"
      :value="formatValue(kpi)"
      :hint="kpi.trend.comparedTo"
      :trend="kpi.trend"
    />
  </div>
</template>
