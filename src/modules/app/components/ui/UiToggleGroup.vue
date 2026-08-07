<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'

import {
  useUiToggleGroup,
  type ToggleGroupOption,
  type ToggleGroupProps,
} from '@/composables/forms'

const props = withDefaults(
  defineProps<
    ToggleGroupProps & {
      provider?: 'reka'
    }
  >(),
  {
    provider: 'reka',
    multiple: false,
    size: 'md',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const { isSelected, toggleValue } = useUiToggleGroup(props, emit)

const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm min-h-[44px] min-w-[44px] lg:min-h-8 lg:min-w-8 lg:py-1.5',
  lg: 'px-4 py-2 text-base',
}

function itemClasses(option: ToggleGroupOption) {
  return [
    'inline-flex items-center justify-center font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'border-border border-e last:border-e-0',
    // Semantic tokens rather than ramp steps: the selected fill needs a
    // foreground the THEME chooses (brutalist's neon primary takes dark text,
    // where white fails contrast), and the unselected state must stay legible
    // on themes whose ramp is not mid-tone at 200/700.
    isSelected(option.value)
      ? 'bg-primary-solid text-primary-foreground'
      : 'bg-card text-foreground hover:bg-muted',
    option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    sizeClasses[props.size],
  ]
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-foreground text-sm font-medium">
      {{ label }}
    </label>
    <div
      class="btns-wrapper border-border inline-flex overflow-hidden rounded-md border"
      role="group"
      :data-provider="provider"
      data-ui="togglegroup"
    >
      <ToggleGroupRoot
        :model-value="modelValue"
        :type="multiple ? 'multiple' : 'single'"
        class="contents"
        @update:model-value="emit('update:modelValue', $event as string | string[])"
      >
        <ToggleGroupItem
          v-for="option in options"
          :key="option.value"
          class="flex-1 whitespace-nowrap"
          :class="itemClasses(option)"
          :value="option.value"
          :disabled="option.disabled || disabled"
          @click="toggleValue(option.value)"
        >
          {{ option.label }}
        </ToggleGroupItem>
      </ToggleGroupRoot>
    </div>
    <p v-if="error" class="text-destructive text-xs" role="alert">
      {{ error }}
    </p>
  </div>
</template>
