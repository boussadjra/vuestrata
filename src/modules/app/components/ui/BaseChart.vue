<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import type { EChartsOption } from 'echarts'
import { useI18n } from 'vue-i18n'

/**
 * ECharts is loaded on DEMAND, not with this component's module.
 *
 * `import VChart from 'vue-echarts'` put echarts into BaseChart's static
 * import graph, and because the module registry pulls every module barrel into
 * the entry graph, that in turn put `charts-vendor` — 778 KB raw, 264 KB
 * gzipped — into index.html's modulepreload list. Every visitor downloaded the
 * whole charting engine before first paint, including on the login page, which
 * has no chart on it. The manualChunks comment in vite.config.ts already said
 * charts are "almost never needed on the first paint"; the import made that
 * untrue.
 *
 * The type import above stays static: types are erased and cost nothing.
 */
const VChart = defineAsyncComponent(async () => {
  const [{ default: Chart }, { ensureEchartsRegistered }] = await Promise.all([
    import('vue-echarts'),
    import('~/lib/echarts-setup'),
  ])
  // Registration must happen before the first render, not at module scope of
  // this file — that was the other half of the eager import.
  ensureEchartsRegistered()
  return Chart
})

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

const { locale } = useI18n()
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

/**
 * Canvas tweening is JavaScript, not CSS. `motion.css` can stop every
 * `transition-*` and `animate-*` utility; it cannot stop ECharts drawing a
 * pie as a one-second expansion. WCAG 2.3.3: if the user asked for less
 * motion, the chart appears in its final state.
 */
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

const chartOption = computed<EChartsOption>(() => {
  if (!prefersReducedMotion.value) return props.option
  return {
    ...props.option,
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    stateAnimation: { duration: 0 },
  }
})
</script>

<template>
  <figure class="m-0 min-w-0">
    <figcaption v-if="title" class="mb-3">
      <h2 class="text-foreground text-lg font-bold">{{ title }}</h2>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm">
        {{ description }}
      </p>
    </figcaption>

    <!--
      Canvas charts keep a left-to-right coordinate system even when the page is
      RTL. Isolating `dir` here avoids zero-width hosts and mis-measured axes
      under `html[dir=rtl]`, without flipping surrounding copy.
    -->
    <div :class="height" class="min-w-0" dir="ltr">
      <!--
        `role="img"` collapses the canvas into a single labelled node; without
        it screen readers announce an unlabelled graphic. `aria-describedby`
        points at the data table so a user can jump straight to the numbers.
      -->
      <VChart
        :key="locale"
        :option="chartOption"
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
      accessibility tree entirely, which would defeat the purpose. `sr-only` on
      a WRAPPER (not the table) keeps the 1px clip; a `sr-only` table with
      `whitespace-nowrap` still inflated `scrollWidth` by ~16px on a 320px
      viewport.
    -->
    <div v-if="hasTable" class="sr-only">
      <table :id="`${chartId}-table`">
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
    </div>

    <slot />
  </figure>
</template>
