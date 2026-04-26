<script setup lang="ts">
export interface ProgressProps {
  value?: number
  max?: number
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<ProgressProps>(), {
  value: 0,
  max: 100,
  showValue: false,
  size: 'md',
})

const safeMax = computed(() => (props.max > 0 ? props.max : 100))
const clampedValue = computed(() => Math.max(0, Math.min(props.value, safeMax.value)))
const percentage = computed(() => Math.round((clampedValue.value / safeMax.value) * 100))

const sizeClasses: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-3.5',
}
</script>

<template>
  <div class="flex flex-col gap-1.5" data-provider="reka" data-ui="progress">
    <div
      v-if="label || showValue"
      class="text-surface-500 dark:text-surface-400 flex items-center justify-between text-xs"
    >
      <span v-if="label">{{ label }}</span>
      <span v-if="showValue">{{ percentage }}%</span>
    </div>

    <div
      class="bg-surface-200 dark:bg-surface-700 w-full overflow-hidden rounded-full"
      :class="sizeClasses[size]"
      role="progressbar"
      :aria-label="label || 'Progress'"
      :aria-valuemin="0"
      :aria-valuemax="safeMax"
      :aria-valuenow="clampedValue"
    >
      <div
        class="from-primary-500 to-accent-500 h-full rounded-full bg-linear-to-r transition-all duration-300"
        :style="{ width: `${percentage}%` }"
      />
    </div>
  </div>
</template>
