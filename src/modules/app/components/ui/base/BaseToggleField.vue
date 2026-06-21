<script setup lang="ts">
import { useBaseToggle, type ToggleProps } from '@/components/ui/base'

const props = withDefaults(
  defineProps<
    ToggleProps & {
      provider: 'reka'
    }
  >(),
  {
    size: 'md',
  },
)

defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { inputProps, labelProps, isChecked, toggle } = useBaseToggle(props)

const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
}

const toggleClasses = computed(() => [
  'inline-flex items-center justify-center rounded-md border font-medium transition-colors',
  props.provider === 'reka'
    ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
    : '',
  isChecked.value
    ? 'bg-primary-700 border-primary-700 text-white hover:bg-primary-800'
    : props.provider === 'reka'
      ? 'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700'
      : 'bg-white border-surface-300 text-surface-700 hover:bg-surface-50',
  sizeClasses[props.size],
])
</script>

<template>
  <span
    v-bind="inputProps"
    role="checkbox"
    tabindex="0"
    :class="toggleClasses"
    data-ui="toggle"
    :data-provider="provider"
    @click="toggle()"
    @keydown.space.prevent="toggle()"
  >
    <label v-if="label" v-bind="labelProps" class="cursor-pointer select-none">
      {{ label }}
    </label>
    <slot v-else />
  </span>
</template>
