<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiButton, UiEmptyState, UiStatCard } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'

import type { DashboardStats, Kpi } from '../types/dashboard'

const props = defineProps<{
  data: DashboardStats | undefined
  loading: boolean
  error: boolean
  /** Refetch in flight after the first result — do not blank the row. */
  updating?: boolean
}>()

defineEmits<{ retry: [] }>()

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

/**
 * `comparedTo` is a range key (`7d`), not copy. Translating here keeps
 * `UiStatCard` / `UiTrendDelta` as display-string components.
 */
function kpiLabel(id: Kpi['id']): string {
  if (id === 'activeUsers') return t('dash_kpi_activeUsers')
  if (id === 'newSignups') return t('dash_kpi_newSignups')
  if (id === 'churnRate') return t('dash_kpi_churnRate')
  return t('dash_kpi_revenue')
}

function comparisonLabel(kpi: Kpi): string {
  // Literals, not `t('dash_compared_' + range)`. `@intlify/unplugin-vue-i18n`
  // compiles messages at build time; a constructed key is missing from that
  // map and ships as the label (`dash_compared_7d` on the live board).
  const range = kpi.trend.comparedTo
  if (range === '30d') return t('dash_compared_30d')
  if (range === '90d') return t('dash_compared_90d')
  return t('dash_compared_7d')
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
        :label="t('common_loading')"
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
        :title="t('common_error_title')"
        :description="t('common_error_body')"
      >
        <template #action>
          <UiButton variant="ghost" size="sm" :loading="updating" @click="$emit('retry')">
            {{ t('common_retry') }}
          </UiButton>
        </template>
      </UiEmptyState>
    </section>

    <UiStatCard
      v-else
      v-for="kpi in kpis"
      :key="kpi.id"
      :label="kpiLabel(kpi.id)"
      :value="formatValue(kpi)"
      :hint="comparisonLabel(kpi)"
      :trend="displayTrend(kpi)"
    />
  </div>
</template>
