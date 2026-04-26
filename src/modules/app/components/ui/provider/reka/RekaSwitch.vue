<script setup lang="ts">
import { useBaseSwitch, type SwitchProps } from '@/components/ui/base'

const props = withDefaults(defineProps<SwitchProps>(), {
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { inputProps, labelProps, isPressed, errorMessageProps, displayError } = useBaseSwitch(props)

const sizeMap: Record<string, { track: string; thumb: string; translate: string }> = {
  sm: { track: 'h-5 w-9', thumb: 'h-3.5 w-3.5', translate: 'translate-x-4' },
  md: { track: 'h-6 w-11', thumb: 'h-4 w-4', translate: 'translate-x-5' },
  lg: { track: 'h-7 w-14', thumb: 'h-5 w-5', translate: 'translate-x-7' },
}

const s = computed(() => sizeMap[props.size]!)
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="inline-flex items-center gap-2">
      <span
        v-bind="inputProps"
        role="switch"
        tabindex="0"
        :class="[
          'relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors',
          isPressed ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600',
          'focus-visible:ring-primary-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          s.track,
        ]"
        data-ui="switch"
        data-provider="reka"
      >
        <span
          :class="[
            'block rounded-full bg-white shadow-sm transition-transform',
            isPressed ? s.translate : 'translate-x-1',
            s.thumb,
          ]"
          style="margin-top: auto; margin-bottom: auto"
        />
      </span>
      <label v-if="label" v-bind="labelProps" class="cursor-pointer text-sm select-none">
        {{ label }}
      </label>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
  </div>
</template>
