<script setup lang="ts">
import VChart from 'vue-echarts'

export interface BaseChartProps {
  option: Record<string, any>
  height?: string
  loading?: boolean
  title?: string
  description?: string
}

withDefaults(defineProps<BaseChartProps>(), {
  height: 'h-72',
  loading: false,
})

const initOptions = { renderer: 'canvas' as const }
</script>

<template>
  <div class="min-w-0">
    <div v-if="title" class="mb-3">
      <h2 class="text-surface-800 text-lg font-bold dark:text-white">{{ title }}</h2>
      <p v-if="description" class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
        {{ description }}
      </p>
    </div>
    <div :class="height" class="min-w-0">
      <VChart
        :option="option"
        :init-options="initOptions"
        :loading="loading"
        autoresize
        class="block size-full min-w-0"
      />
    </div>
    <slot />
  </div>
</template>
