<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'

import { useDashboardI18n } from '../composables/useDashboardI18n'
import {
  buildGalleryChart,
  type GalleryChartContext,
  type GalleryChartFamily,
  type GalleryChartId,
} from '../lib/chart-gallery'

const props = defineProps<{
  example: { id: GalleryChartId; family: GalleryChartFamily }
  context: GalleryChartContext
}>()

const GalleryChartRenderer = defineAsyncComponent({
  loader: () => import('./GalleryChartRenderer.vue'),
  errorComponent: defineComponent({
    inheritAttrs: false,
    props: { error: { type: null, default: undefined } },
    setup() {
      const { dt } = useDashboardI18n()
      return () =>
        h(
          'p',
          {
            class:
              'border-border bg-muted text-muted-foreground flex h-80 items-center justify-center rounded-[var(--shape-radius)] border border-dashed p-4 text-center text-sm',
          },
          dt('chart_load_error'),
        )
    },
  }),
})
const { dt } = useDashboardI18n()
const host = useTemplateRef<HTMLElement>('host')
const hasEntered = ref(false)
const dataExpanded = ref(false)
const { stop, isSupported } = useIntersectionObserver(
  host,
  ([entry]) => {
    if (entry?.isIntersecting) {
      hasEntered.value = true
      stop()
    }
  },
  { rootMargin: '300px 0px' },
)

const shouldRender = computed(() => hasEntered.value || !isSupported.value || dataExpanded.value)
const key = computed(() => props.example.id.replaceAll('-', '_'))
const title = computed(() => dt(`chart_gallery_${key.value}_title`))
const description = computed(() => dt(`chart_gallery_${key.value}_desc`))
const chart = computed(() =>
  shouldRender.value ? buildGalleryChart(props.example.id, props.context) : undefined,
)

function onDataToggle(event: Event) {
  dataExpanded.value = (event.currentTarget as HTMLDetailsElement).open
}
</script>

<template>
  <article
    ref="host"
    class="card min-w-0 p-4 sm:p-5"
    data-testid="chart-example"
    :data-chart-id="example.id"
    :data-chart-family="example.family"
  >
    <p class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
      {{ dt(`chart_gallery_family_${example.family}`) }}
    </p>
    <h2 class="text-foreground text-lg font-bold">{{ title }}</h2>
    <p class="text-muted-foreground mt-1 text-sm">{{ description }}</p>
    <div class="mt-3 min-h-80">
      <GalleryChartRenderer
        v-if="chart"
        :chart="chart"
        :title="title"
        :description="description"
        :data-expanded="dataExpanded"
      />
      <div v-else class="bg-muted h-80 rounded-[var(--shape-radius)]" aria-hidden="true" />
    </div>

    <details class="border-border mt-4 border-t pt-3" @toggle="onDataToggle">
      <summary
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >
        {{ dt('chart_gallery_view_data') }}
      </summary>
      <div
        v-if="dataExpanded && chart"
        class="border-border mt-3 max-h-72 overflow-auto rounded-[var(--shape-radius)] border"
      >
        <table class="w-full text-start text-sm">
          <caption class="text-muted-foreground bg-muted px-3 py-2 text-start text-xs">
            {{
              title
            }}
            ·
            {{
              dt('chart_gallery_sample_data')
            }}
          </caption>
          <thead class="bg-muted text-foreground">
            <tr>
              <th
                v-for="column in chart.dataColumns"
                :key="column"
                scope="col"
                class="border-border border-b px-3 py-2 text-start font-semibold"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in chart.dataRows"
              :key="row.label"
              class="border-border border-b last:border-0"
            >
              <th scope="row" class="px-3 py-2 text-start font-medium">{{ row.label }}</th>
              <td
                v-for="(value, index) in row.values"
                :key="index"
                class="px-3 py-2 text-start tabular-nums"
              >
                {{ value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </article>
</template>
