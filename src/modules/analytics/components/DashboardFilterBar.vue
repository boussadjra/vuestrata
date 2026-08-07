<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiSelect, UiToggleGroup } from '@/components/ui'

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

const { t } = useI18n()

const rangeOptions = computed(() =>
  DASHBOARD_RANGES.map((range) => ({ label: t(`dash_range_${range}`), value: range })),
)

const segmentOptions = computed(() =>
  DASHBOARD_SEGMENTS.map((segment) => ({ label: t(`dash_segment_${segment}`), value: segment })),
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
  <div class="flex flex-wrap items-center gap-2">
    <!--
      A labelled group, not three loose buttons: without the group label a
      screen reader announces "7 days, button" with no indication of what the
      choice controls.
    -->
    <UiToggleGroup
      :model-value="filters.range"
      :options="rangeOptions"
      size="sm"
      :aria-label="t('dash_filter_range')"
      @update:model-value="setRange"
    />

    <UiSelect
      :model-value="filters.segment"
      :options="segmentOptions"
      class="min-w-40"
      :aria-label="t('dash_filter_segment')"
      @update:model-value="setSegment"
    />
  </div>
</template>
