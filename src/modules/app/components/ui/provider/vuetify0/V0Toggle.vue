<script setup lang="ts">
import { useBaseToggle, type ToggleProps } from '@/components/ui/base'

const props = withDefaults(defineProps<ToggleProps>(), {
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { inputProps, labelProps, isChecked, toggle } = useBaseToggle(props)

const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
}

const toggleClasses = computed(() => [
  'inline-flex items-center justify-center rounded-md border font-medium transition-colors',
  isChecked.value
    ? 'bg-primary-500 border-primary-500 text-white'
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
    data-provider="vuetify0"
    @click="toggle()"
    @keydown.space.prevent="toggle()"
  >
    <label v-if="label" v-bind="labelProps" class="cursor-pointer select-none">
      {{ label }}
    </label>
    <slot v-else />
  </span>
</template>
