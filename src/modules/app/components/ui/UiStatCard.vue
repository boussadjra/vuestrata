<script setup lang="ts">
import UiSkeleton from './UiSkeleton.vue'
import UiTrendDelta from './UiTrendDelta.vue'

export interface StatCardProps {
  label: string
  /** Already formatted for the active locale by the caller. */
  value: string
  /** Optional supporting line, e.g. the comparison window. */
  hint?: string
  trend?: {
    changePercent: number
    direction: 'up' | 'down' | 'flat'
    isImprovement: boolean
    comparedTo?: string
  }
  loading?: boolean
}

withDefaults(defineProps<StatCardProps>(), { loading: false })

const headingId = useId()
</script>

<template>
  <!--
    A <section> with an accessible name, not a bare <div>. Screen-reader users
    navigate by landmark and heading; a wall of unnamed divs is one
    undifferentiated blob. `aria-labelledby` points at the metric's own label so
    the region announces as e.g. "Revenue, region". `data-ui="card"` is what
    theme files select for glass, marks, and offset shadows.
  -->
  <section
    :aria-labelledby="headingId"
    data-ui="card"
    class="border-border bg-card flex flex-col gap-2 rounded-[var(--shape-radius)] border p-4 shadow-(--shadow-card)"
  >
    <p :id="headingId" class="text-muted-foreground text-sm font-medium">{{ label }}</p>

    <template v-if="loading">
      <UiSkeleton class="h-8 w-28" />
      <UiSkeleton class="h-4 w-20" />
    </template>

    <template v-else>
      <p class="text-foreground text-2xl font-bold tabular-nums">{{ value }}</p>
      <div class="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-0.5">
        <UiTrendDelta
          v-if="trend"
          :change-percent="trend.changePercent"
          :direction="trend.direction"
          :is-improvement="trend.isImprovement"
          :compared-to="trend.comparedTo"
          size="sm"
        />
        <span v-if="hint" class="text-muted-foreground text-xs">{{ hint }}</span>
      </div>
    </template>

    <slot />
  </section>
</template>
