<script setup lang="ts">
import { UiSelect, UiToggleGroup } from '@/components/ui'

import { useDashboardI18n } from '../composables/useDashboardI18n'
import {
  DASHBOARD_RANGES,
  DASHBOARD_SEGMENTS,
  type DashboardFilters,
  type DashboardRange,
  type DashboardSegment,
} from '../types/dashboard'

/**
 * Date-range and segment controls.
 *
 * Both are part of every dashboard query key, so changing either refetches the
 * whole board. Panels stay on one consistent window instead of quietly showing
 * figures from different periods next to each other.
 */
const filters = defineModel<DashboardFilters>({ required: true })

const { dt } = useDashboardI18n()

function rangeLabel(range: DashboardRange): string {
  if (range === '30d') return dt('dash_range_30d')
  if (range === '90d') return dt('dash_range_90d')
  return dt('dash_range_7d')
}

function segmentLabel(segment: DashboardSegment): string {
  if (segment === 'enterprise') return dt('dash_segment_enterprise')
  if (segment === 'new') return dt('dash_segment_new')
  if (segment === 'returning') return dt('dash_segment_returning')
  return dt('dash_segment_all')
}

const rangeOptions = computed(() =>
  DASHBOARD_RANGES.map((range) => ({ label: rangeLabel(range), value: range })),
)

const segmentOptions = computed(() =>
  DASHBOARD_SEGMENTS.map((segment) => ({ label: segmentLabel(segment), value: segment })),
)

function setRange(value: string | string[]) {
  if (typeof value === 'string' && (DASHBOARD_RANGES as readonly string[]).includes(value)) {
    filters.value = { ...filters.value, range: value as DashboardRange }
  }
}

function setSegment(value: string | number | Array<string | number>) {
  // UiSelect supports multi-select, so its emitted value may be an array.
  // This is a single-select, and validating the incoming value keeps an
  // unexpected shape from being written into the query key.
  if (typeof value === 'string' && (DASHBOARD_SEGMENTS as readonly string[]).includes(value)) {
    filters.value = { ...filters.value, segment: value as DashboardSegment }
  }
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
    <!--
      Column on a phone, row from `sm`. A wrapping row that is sized by its
      content never wraps — the box grows, and the page scrolls sideways.
    -->
    <!--
      A labelled group, not three loose buttons: without the group label a
      screen reader announces "7 days, button" with no indication of what the
      choice controls.
    -->
    <UiToggleGroup
      class="w-full sm:w-auto"
      :model-value="filters.range"
      :options="rangeOptions"
      :aria-label="dt('dash_filter_range')"
      @update:model-value="setRange"
    />

    <UiSelect
      :model-value="filters.segment"
      :options="segmentOptions"
      class="w-full min-w-0 sm:h-[var(--control-height)] sm:w-56"
      :aria-label="dt('dash_filter_segment')"
      @update:model-value="setSegment"
    />
  </div>
</template>
