<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'

/** One row of the non-visual equivalent of the chart. */
export interface ChartDataRow {
  /** Category / x-axis value. */
  label: string
  /** One entry per series, in the same order as `dataColumns`. */
  values: Array<string | number>
}

export interface BaseChartProps {
  option: EChartsOption
  height?: string
  loading?: boolean
  title?: string
  description?: string
  /**
   * What the chart shows, in words. Becomes the canvas's accessible name.
   *
   * Falls back to `title` + `description`. Prefer stating the TREND rather than
   * restating the title: "Revenue rose 24% over the last seven days, peaking on
   * Saturday" tells a screen-reader user what a sighted user takes from the
   * shape. "Revenue chart" tells them nothing.
   */
  summary?: string
  /** Column headers for the data table: the category column, then each series. */
  dataColumns?: string[]
  /**
   * The underlying data. Rendered as a visually-hidden table so the numbers are
   * reachable without seeing the canvas (WCAG 1.1.1). A canvas is a single
   * opaque node to assistive technology — without this the data does not exist
   * for anyone not looking at it.
   */
  dataRows?: ChartDataRow[]
  /** Caption for the fallback table. Defaults to `title`. */
  dataCaption?: string
}

const props = withDefaults(defineProps<BaseChartProps>(), {
  height: 'h-72',
  loading: false,
})

const chartId = useId()

const accessibleName = computed(() => {
  if (props.summary) return props.summary
  return [props.title, props.description].filter(Boolean).join('. ')
})

/**
 * `role="img"` is applied ONLY when there is a name for it.
 *
 * An `img` with no accessible name is worse than no role at all: it announces
 * as an unlabelled graphic and cannot be skipped. Without a name the canvas is
 * better hidden from assistive technology, with the data table (if provided)
 * carrying the content instead.
 */
const chartRole = computed(() => (accessibleName.value ? 'img' : undefined))
const chartAriaHidden = computed(() => (accessibleName.value ? undefined : 'true'))

const hasTable = computed(() => (props.dataRows?.length ?? 0) > 0)
</script>

<template>
  <figure class="m-0 min-w-0">
    <figcaption v-if="title" class="mb-3">
      <h2 class="text-foreground text-lg font-bold">{{ title }}</h2>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm">
        {{ description }}
      </p>
    </figcaption>

    <div :class="height" class="min-w-0">
      <!--
        `role="img"` collapses the canvas into a single labelled node; without
        it screen readers announce an unlabelled graphic. `aria-describedby`
        points at the data table so a user can jump straight to the numbers.
      -->
      <VChart
        :option="option"
        :init-options="{ renderer: 'canvas' }"
        :loading="loading"
        autoresize
        :role="chartRole"
        :aria-label="accessibleName || undefined"
        :aria-hidden="chartAriaHidden"
        :aria-describedby="hasTable ? `${chartId}-table` : undefined"
        class="block size-full min-w-0"
      />
    </div>

    <!--
      Visually hidden, NOT `display: none` — hidden content is removed from the
      accessibility tree entirely, which would defeat the purpose. `sr-only`
      keeps it reachable by screen readers and by keyboard users tabbing
      through, while taking no visual space.
    -->
    <table v-if="hasTable" :id="`${chartId}-table`" class="sr-only">
      <caption>
        {{
          dataCaption || title
        }}
      </caption>
      <thead>
        <tr>
          <th v-for="column in dataColumns" :key="column" scope="col">{{ column }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in dataRows" :key="row.label">
          <th scope="row">{{ row.label }}</th>
          <td v-for="(value, index) in row.values" :key="index">{{ value }}</td>
        </tr>
      </tbody>
    </table>

    <slot />
  </figure>
</template>
