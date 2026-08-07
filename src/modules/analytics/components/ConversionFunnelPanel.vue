<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import { useFormatters } from '@/composables/useFormatters'

import { useChartColors } from '../composables/useChartColors'
import type { Funnel } from '../types/dashboard'

const props = defineProps<{
  data: Funnel | undefined
  loading: boolean
  error: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { number, percent } = useFormatters()
const chart = useChartColors()

const stages = computed(() => props.data?.stages ?? [])
const isEmpty = computed(() => stages.value.length === 0)

/**
 * Rendered as a semantic list with proportional bars rather than an ECharts
 * funnel.
 *
 * A funnel's job is comparing consecutive stages, and a canvas cannot expose
 * that to assistive technology or to text selection. Real DOM elements give
 * every stage its own label, its own count, and its own drop-off figure for
 * free — and the shape still reads at a glance.
 */
const rows = computed(() =>
  stages.value.map((stage, index) => {
    const previous = stages.value[index - 1]
    const dropOff =
      previous && previous.count > 0 ? ((previous.count - stage.count) / previous.count) * 100 : 0
    return { ...stage, dropOff, color: chart.seriesColor(index) }
  }),
)
</script>

<template>
  <UiPanel
    :title="t('dash_funnel_title')"
    :description="t('dash_funnel_desc')"
    :loading="loading"
    :error="error"
    :empty="isEmpty"
    content-class="min-h-64"
    @retry="emit('retry')"
  >
    <ol class="space-y-3">
      <li v-for="(row, index) in rows" :key="row.key" class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-3 text-sm">
          <span class="text-foreground font-medium">{{ row.label }}</span>
          <!--
            Both figures use `muted-foreground`. `subtle-foreground` is a
            decorative step — it does not clear AA at body size, and this
            conversion rate is information the reader needs, not ornament.
          -->
          <span class="text-muted-foreground tabular-nums">
            {{ number(row.count) }}
            <span aria-hidden="true">·</span>
            {{ percent(row.conversionFromTop) }}
          </span>
        </div>

        <!--
          `role="img"` with a spoken label: the bar is a picture of the number
          already stated above it, so announcing its internals would be noise.
        -->
        <div
          class="bg-muted h-2.5 w-full overflow-hidden rounded-full"
          role="img"
          :aria-label="
            t('dash_funnel_stage_label', {
              stage: row.label,
              count: number(row.count),
              share: percent(row.conversionFromTop),
            })
          "
        >
          <div
            class="h-full rounded-full transition-[width] duration-500"
            :style="{ width: `${row.conversionFromTop}%`, backgroundColor: row.color }"
          />
        </div>

        <p v-if="index > 0 && row.dropOff > 0" class="text-muted-foreground text-xs">
          {{ t('dash_funnel_dropoff', { percent: percent(row.dropOff) }) }}
        </p>
      </li>
    </ol>
  </UiPanel>
</template>
